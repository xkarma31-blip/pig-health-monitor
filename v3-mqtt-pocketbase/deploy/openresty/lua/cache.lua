-- lua/cache.lua
-- Response caching for PigPulse API
-- TTL based on endpoint type

local shared_cache = ngx.shared.cache_store

-- Cache TTLs (seconds)
local TTL = {
    telemetry = 5,      -- Real-time data
    alerts = 60,         -- Near real-time
    devices = 300,       -- Slow-changing
    pigs = 3600,         -- Rarely changes
    default = 10,        -- Default
}

-- Get cache TTL for current request
local function get_ttl()
    local uri = ngx.var.request_uri

    if uri:match("/telemetry") then
        return TTL.telemetry
    elseif uri:match("/alerts") then
        return TTL.alerts
    elseif uri:match("/devices") then
        return TTL.devices
    elseif uri:match("/pigs") then
        return TTL.pigs
    else
        return TTL.default
    end
end

-- Check cache before proxying
local function check_cache()
    -- Only cache GET requests
    if ngx.req.get_method() ~= "GET" then
        return
    end

    local key = ngx.var.request_uri
    local ttl = get_ttl()

    local cached = shared_cache:get(key)
    if cached then
        ngx.header["X-Cache"] = "HIT"
        ngx.header["Content-Type"] = "application/json"
        ngx.status = 200
        ngx.say(cached)
        return ngx.exit(200)
    end

    ngx.header["X-Cache"] = "MISS"
end

-- Cache response after proxying
local function set_cache()
    -- Only cache GET requests
    if ngx.req.get_method() ~= "GET" then
        return
    end

    -- Only cache successful responses
    if ngx.status ~= 200 then
        return
    end

    local key = ngx.var.request_uri
    local ttl = get_ttl()
    local body = ngx.arg[1]

    if body and #body > 0 then
        shared_cache:set(key, body, ttl)
    end
end

return {
    check_cache = check_cache,
    set_cache = set_cache,
}
