-- lua/rate_limit.lua
-- Rate limiting for PigPulse API
-- 100 requests per minute per IP (adjustable)

local limit = require "resty.rate limiting"

-- Create rate limiter with shared dict
local lim, err = limit.new("rate_limit_store", 100, 60)
if not lim then
    ngx.log(ngx.ERR, "failed to instantiate rate limiter: ", err)
    return ngx.exit(500)
end

-- Use IP address as key
local key = ngx.var.binary_remote_addr
local delay, err = lim:incoming(key, true)

if not delay then
    if err == "rejected" then
        -- Rate limit exceeded
        ngx.header["Retry-After"] = 60
        ngx.header["Content-Type"] = "application/json"
        ngx.status = 429
        ngx.say('{"error":"Rate limit exceeded","retry_after":60}')
        return ngx.exit(429)
    end
    ngx.log(ngx.ERR, "failed to rate limit: ", err)
    return ngx.exit(500)
end

-- Request allowed
ngx.req.read_body()
