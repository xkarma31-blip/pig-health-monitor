#!/usr/bin/env python3
"""Declare the 7 thermal fields in a PocketBase collection.

PocketBase's collection schema lives in `_collections.schema` (JSON). The record
API accepts and returns ONLY fields declared there -- any other column, even one
present in the SQLite table, is silently discarded with no warning.

That is why `ALTER TABLE telemetry ADD COLUMN verdict TEXT` alone changes
nothing: the column exists but the collection does not declare it. This script
does what `1798000000_updated_telemetry_thermal_fields.js` does, without
needing a PocketBase that can execute JS migrations (the deployed binary is
0.22.20, which cannot).

Idempotent: re-running adds nothing.
"""
import json
import shutil
import sqlite3
import sys

TXT = {"min": None, "max": None, "pattern": ""}


def num(no_decimal=False):
    return {"min": None, "max": None, "noDecimal": no_decimal}


def field(fid, name, typ, opts):
    return {"system": False, "id": fid, "name": name, "type": typ,
            "required": False, "presentable": False, "unique": False,
            "options": opts}


# Field ids and types are taken verbatim from
# pb_migrations/1798000000_updated_telemetry_thermal_fields.js so the two
# representations cannot drift.
NEW = [
    field("thmvrdct", "verdict", "text", dict(TXT)),
    field("thmalrts", "alerts", "number", num(no_decimal=True)),
    field("thmhotpt", "hotspot", "number", num()),
    field("thmcntr2", "center", "number", num()),
    field("thmmaxte", "max", "number", num()),
    field("thmminte", "min", "number", num()),
    field("thmambnt", "ambient", "number", num()),
]

NAMES = [f["name"] for f in NEW]

SQL_COLUMNS = [
    ("verdict", "ALTER TABLE telemetry ADD COLUMN verdict TEXT"),
    ("alerts", "ALTER TABLE telemetry ADD COLUMN alerts INTEGER DEFAULT 0"),
    ("hotspot", "ALTER TABLE telemetry ADD COLUMN hotspot REAL"),
    ("center", "ALTER TABLE telemetry ADD COLUMN center REAL"),
    ("max", "ALTER TABLE telemetry ADD COLUMN max REAL"),
    ("min", "ALTER TABLE telemetry ADD COLUMN min REAL"),
    ("ambient", "ALTER TABLE telemetry ADD COLUMN ambient REAL"),
]


def main(db_path, collection="telemetry", backup=True):
    # `collection` is a collection NAME, not a schema field.
    if backup:
        shutil.copy2(db_path, db_path + ".preschema-backup")
        print(f"  backup: {db_path}.preschema-backup")

    con = sqlite3.connect(db_path)
    cur = con.cursor()
    tables = {r[0] for r in cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table'")}
    if collection not in tables:
        sys.exit(f"FATAL: no such table {collection}")

    cols = {r[1] for r in cur.execute(f"PRAGMA table_info({collection})")}
    raw = cur.execute(
        "SELECT schema FROM _collections WHERE name=?", (collection,)).fetchone()
    if raw is None:
        sys.exit(f"FATAL: {collection} not in _collections")
    schema = json.loads(raw[0])

    declared = {f["name"] for f in schema}
    missing = [n for n in NAMES if n not in declared]
    print(f"  schema: {len(schema)} fields declared; "
          f"thermal missing: {missing or 'none'}")

    for name, stmt in SQL_COLUMNS:
        if name not in cols:
            cur.execute(stmt)
            print(f"  + column {name}")

    if missing:
        by_name = {f["name"]: f for f in NEW}
        schema.extend(by_name[n] for n in missing)
        cur.execute("UPDATE _collections SET schema=? WHERE name=?",
                    (json.dumps(schema), collection))
        print(f"  + declared in _collections.schema: {missing}")

    con.commit()
    integrity = cur.execute("PRAGMA integrity_check").fetchone()[0]
    final = {f["name"] for f in json.loads(cur.execute(
        "SELECT schema FROM _collections WHERE name=?",
        (collection,)).fetchone()[0])}
    n_rows = cur.execute(f"SELECT COUNT(*) FROM {collection}").fetchone()[0]
    con.close()

    print(f"  integrity: {integrity}   rows preserved: {n_rows}")
    still = [n for n in NAMES if n not in final]
    print("  RESULT: " + ("all 7 thermal fields declared"
                         if not still else f"STILL MISSING {still}"))
    return 0 if not still else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "telemetry"))
