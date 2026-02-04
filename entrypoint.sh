#!/bin/bash
set -e

# Fix permissions for mounted volumes
if [ -d "/home/automation/logs" ] && [ "$(stat -c %U /home/automation/logs)" != "automation" ]; then
    sudo chown -R automation:automation /home/automation/logs
fi

if [ -d "/home/automation/screenshots" ] && [ "$(stat -c %U /home/automation/screenshots)" != "automation" ]; then
    sudo chown -R automation:automation /home/automation/screenshots
fi

# Execute the provided command
exec "$@"