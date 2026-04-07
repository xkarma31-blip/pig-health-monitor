#!/bin/bash

# TestSprite Ritual Wrapper
# This script bypasses the MCP transport to avoid "stuck" states.

export TESTSPRITE_API_KEY="sk-user-SBwqhD2iodUkFQGfrPiuww_4sZ2-dmxujRwP3_UWifqfa2HdsgnGOFmGSjKssVIDvw07BZxTL9bAQ7swS60esd6c-QZ6oONJWCCNhyvVggazJbWwoQL-z-cmLBU9SZYtfEY"

# Pass all arguments to the testsprite-mcp CLI
npx @testsprite/testsprite-mcp "$@"
