#!/bin/bash
# Create directories if they don't exist
mkdir -p /tmp/screenshots
mkdir -p /tmp/logs
exec "$@"