-- lua/auth.lua
-- JWT authentication for PigPulse API
-- Validates tokens at proxy level (faster than app-level)

local jwt = require "resty.jwt"

-- JWT secret (should match PocketBase or your auth service)
local JWT_SECRET = os.getenv("JWT_SECRET") or "pigpulse-secret-key"

-- Endpoints that don't require auth
local PUBLIC_ENDPOINTS = {
    ["/health"] = true,
    ["/api/admins/auth-with-password"] = true,
    ["/api/collections/*/auth-with-password"] = true,
}

-- Check if endpoint is public
local function is_public(uri)
    for pattern, _ in pairs(PUBLIC_ENDPOINTS) do
        if uri:match(pattern) then
            return true
        end
    end
    return false
end

-- Validate JWT token
local function validate_token()
    local uri = ngx.var.request_uri

    -- Skip auth for public endpoints
    if is_public(uri) then
        return
    end

    -- Get Authorization header
    local auth_header = ngx.var.http_authorization
    if not auth_header then
        ngx.header["Content-Type"] = "application/json"
        ngx.status = 401
        ngx.say('{"error":"Missing authorization header"}')
        return ngx.exit(401)
    end

    -- Extract token
    local token = string.match(auth_header, "Bearer (.+)")
    if not token then
        ngx.header["Content-Type"] = "application/json"
        ngx.status = 401
        ngx.say('{"error":"Invalid authorization format"}')
        return ngx.exit(401)
    end

    -- Verify JWT
    local jwt_obj = jwt:verify(JWT_SECRET, token)
    if not jwt_obj.verified then
        ngx.header["Content-Type"] = "application/json"
        ngx.status = 401
        ngx.say('{"error":"Invalid or expired token"}')
        return ngx.exit(401)
    end

    -- Set user ID header for downstream services
    if jwt_obj.payload and jwt_obj.payload.sub then
        ngx.req.set_header("X-User-ID", jwt_obj.payload.sub)
    end
end

validate_token()
