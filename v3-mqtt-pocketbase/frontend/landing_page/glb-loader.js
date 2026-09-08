/* glb-loader.js — minimal GLB loader for landing page, uses global THREE */
(function () {
  'use strict';
  if (window._glbLoaderReady) return;
  window._glbLoaderReady = true;

  function decodeAccessor(glb, accessor) {
    const bv = glb.bufferViews[accessor.bufferView];
    const bufferData = glb.buffers[bv.buffer];
    const srcOffset = (bv.byteOffset || 0) + (accessor.byteOffset || 0);
    const comp = accessor.componentType;
    const count = accessor.count;
    const type = accessor.type;
    const mul = type === 'VEC3' ? 3 : type === 'VEC2' ? 2 : 1;
    /* Copy into an independent ArrayBuffer to avoid any shared-buffer
       corruption when Three.js mutates attribute data (e.g. computeVertexNormals). */
    var elemBytes, Ctor;
    switch (comp) {
      case 5126: Ctor = Float32Array; elemBytes = 4; break;
      case 5123: Ctor = Uint16Array;  elemBytes = 2; break;
      case 5122: Ctor = Int16Array;   elemBytes = 2; break;
      case 5125: Ctor = Uint32Array;  elemBytes = 4; break;
      case 5121: Ctor = Uint8Array;   elemBytes = 1; break;
      case 5120: Ctor = Int8Array;    elemBytes = 1; break;
      default: throw new Error('Unsupported componentType: ' + comp);
    }
    var len = comp === 5125 ? count : count * mul;
    var tmp = new Uint8Array(len * elemBytes);
    tmp.set(new Uint8Array(bufferData.buffer, bufferData.byteOffset + srcOffset, len * elemBytes));
    var arr = new Ctor(tmp.buffer);
    return { data: arr, type: type, count: count };
  }

  function buildMaterial(mat, textures) {
    const T = THREE;
    const src = mat.pbrMetallicRoughness || {};
    const color = src.baseColorFactor
      ? new T.Color(src.baseColorFactor[0], src.baseColorFactor[1], src.baseColorFactor[2])
      : new T.Color(0.6, 0.6, 0.6);
    const m = new T.MeshStandardMaterial({
      color: color,
      roughness: src.roughnessFactor != null ? src.roughnessFactor : 0.6,
      metalness: src.metallicFactor != null ? src.metallicFactor : 0,
      side: mat.doubleSided ? T.DoubleSide : T.FrontSide,
    });
    if (src.baseColorTexture && textures[src.baseColorTexture.index]) {
      m.map = textures[src.baseColorTexture.index];
      m.color.setHex(0xffffff);
    }
    if (mat.alphaMode === 'BLEND') {
      m.transparent = true;
      m.alphaTest = 0;
      m.depthWrite = false;
    }
    m.needsUpdate = true;
    return m;
  }

  function buildNode(nodeIdx, glb, textures, materials, nodeMap) {
    const T = THREE;
    const node = glb.nodes[nodeIdx];
    const obj = new T.Object3D();
    obj.name = node.name || '';
    if (node.mesh !== undefined) {
      const mesh = glb.meshes[node.mesh];
      mesh.primitives.forEach(function (prim) {
        const geom = new T.BufferGeometry();
        const pos = decodeAccessor(glb, glb.accessors[prim.attributes.POSITION]);
        geom.setAttribute('position', new T.BufferAttribute(pos.data, 3));
        if (prim.attributes.NORMAL !== undefined) {
          const n = decodeAccessor(glb, glb.accessors[prim.attributes.NORMAL]);
          geom.setAttribute('normal', new T.BufferAttribute(n.data, 3));
        }
        if (prim.attributes.TEXCOORD_0 !== undefined) {
          const t = decodeAccessor(glb, glb.accessors[prim.attributes.TEXCOORD_0]);
          geom.setAttribute('uv', new T.BufferAttribute(t.data, 2));
        }
        if (prim.indices !== undefined) {
          const idx = decodeAccessor(glb, glb.accessors[prim.indices]);
          geom.setIndex(new T.BufferAttribute(idx.data, 1));
        } else {
          geom.setIndex(new Array(pos.count).fill(0).map(function (_, i) { return i; }));
        }
        geom.computeBoundingSphere();
        geom.computeBoundingBox();
        geom.computeVertexNormals();
        const mat = prim.material !== undefined
          ? buildMaterial(materials[prim.material], textures)
          : new T.MeshStandardMaterial({ color: 0x999999, roughness: 0.6, metalness: 0 });
        const meshObj = new T.Mesh(geom, mat);
        meshObj.name = mesh.name || '';
        obj.add(meshObj);
      });
    }
    if (node.rotation) obj.quaternion.set(node.rotation[0], node.rotation[1], node.rotation[2], node.rotation[3]);
    if (node.scale) obj.scale.set(node.scale[0], node.scale[1], node.scale[2]);
    if (node.translation) obj.position.set(node.translation[0], node.translation[1], node.translation[2]);
    /* Recurse into children */
    if (node.children) {
      node.children.forEach(function (childIdx) {
        obj.add(buildNode(childIdx, glb, textures, materials, nodeMap));
      });
    }
    return obj;
  }

  window._loadGLB = function (url, onDone) {
    const T = THREE;
    fetch(url)
      .then(function (r) { return r.arrayBuffer(); })
      .then(function (buf) {
        const magic = String.fromCharCode.apply(null, new Uint8Array(buf, 0, 4));
        if (magic !== 'glTF') throw new Error('Not a GLB');
        const dv = new DataView(buf);
        /* GLB 2.0 layout: [header 12B] [chunk0_len 4B] [chunk0_type 4B] [jsonChunkData] [chunk1_len 4B] [chunk1_type 4B] [binChunkData] */
        const jsonChunkLen = dv.getUint32(12, true);
        const jsonBytes = new Uint8Array(buf, 20, jsonChunkLen);
        const text = new TextDecoder().decode(jsonBytes);
        const json = JSON.parse(text);
        /* Binary chunk starts after JSON chunk data + 8-byte binary chunk header */
        const binOffset = 20 + jsonChunkLen + 8;

        // Load buffer 0 directly from binary — the ENTIRE binary chunk is buffer 0
        const buffers = json.buffers.map(function (b) { return { byteLength: b.byteLength }; });
        if (buffers.length > 0) {
          buffers[0] = new Uint8Array(buf, binOffset, json.buffers[0].byteLength);
        }

        // Build textures from embedded images
        const textures = [];
        (json.textures || []).forEach(function (t) {
          const img = json.images[t.source];
          if (!img || img.bufferView == null) return;
          const bv = json.bufferViews[img.bufferView];
          const imgData = new Uint8Array(buf, binOffset + (bv.byteOffset || 0), bv.byteLength);
          const blob = new Blob([imgData], { type: img.mimeType });
          const blobUrl = URL.createObjectURL(blob);
          const tex = new T.TextureLoader().load(blobUrl);
          tex.colorSpace = T.SRGBColorSpace;
          textures.push(tex);
        });

        const materials = (json.materials || []).map(function (m) { return buildMaterial(m, textures); });

        const sceneIdx = json.scene != null ? json.scene : 0;
        const rootNodes = (json.scenes[sceneIdx] && json.scenes[sceneIdx].nodes) || [];
        const root = new T.Group();

        /* Diagnostic: log first accessor data */
        var _dbgPos = decodeAccessor({ buffers: buffers, bufferViews: json.bufferViews }, json.accessors[0]);
        console.log('[GLB] buf0 type:', buffers[0].constructor.name, 'byteOff:', buffers[0].byteOffset, 'len:', buffers[0].byteLength);
        console.log('[GLB] acc0 data type:', _dbgPos.data.constructor.name, 'length:', _dbgPos.data.length, 'first6:', Array.from(_dbgPos.data.slice(0, 6)));
        console.log('[GLB] acc0 has NaN:', _dbgPos.data.some(function(v){ return isNaN(v); }));

        /* Build a flat glb context for buildNode */
        const glbCtx = { buffers: buffers, accessors: json.accessors, bufferViews: json.bufferViews, meshes: json.meshes, materials: materials, nodes: json.nodes };

        rootNodes.forEach(function (ni) {
          root.add(buildNode(ni, glbCtx, textures, materials, json.nodes));
        });

        /* Auto-center and scale: compute world bounding box */
        root.updateMatrixWorld(true);
        const box = new T.Box3().setFromObject(root);
        const center = box.getCenter(new T.Vector3());
        const size = box.getSize(new T.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 0) {
          /* Center the model at origin */
          root.position.sub(center);
          /* Scale to fit within a ~2 unit cube */
          root.scale.setScalar(2.0 / maxDim);
        }

        onDone(root);
      })
      .catch(function (e) { console.error('GLB load failed', e); });
  };
})();
