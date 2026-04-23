#!/bin/sh
set -e

# Default values
PUID=${PUID:-1000}
PGID=${PGID:-1000}
USER_NAME=${USER_NAME:-sourceflow}
GROUP_NAME=${GROUP_NAME:-sourceflow}
WORKSPACE_DIR="/sourceflow/workspace"

# Get or create group
group_name="${GROUP_NAME}"
if getent group "${PGID}" > /dev/null 2>&1; then
    group_name=$(getent group "${PGID}" | cut -d: -f1)
    echo "Using existing group: ${group_name} (${PGID})"
else
    echo "Creating group ${group_name} (${PGID})"
    addgroup --gid "${PGID}" "${group_name}"
fi

# Get or create user
user_name="${USER_NAME}"
if getent passwd "${PUID}" > /dev/null 2>&1; then
    user_name=$(getent passwd "${PUID}" | cut -d: -f1)
    echo "Using existing user ${user_name} (PUID: ${PUID}, PGID: ${PGID})"
else
    echo "Creating user ${user_name} (PUID: ${PUID}, PGID: ${PGID})"
    adduser --uid "${PUID}" --ingroup "${group_name}" --disabled-password --gecos "" "${user_name}"
fi

# Parse command line arguments for --workspace option or SOURCEFLOW_WORKSPACE_PATH env variable.
# Keep the original arguments untouched and append the resolved workspace path as the last flag.
if [ -n "${SOURCEFLOW_WORKSPACE_PATH}" ]; then
    WORKSPACE_DIR="${SOURCEFLOW_WORKSPACE_PATH}"
fi
EXPECT_WORKSPACE_PATH=0
for arg in "$@"; do
    if [ "${EXPECT_WORKSPACE_PATH}" -eq 1 ]; then
        WORKSPACE_DIR="${arg}"
        EXPECT_WORKSPACE_PATH=0
        continue
    fi
    case "${arg}" in
        --workspace=*) WORKSPACE_DIR="${arg#*=}" ;;
        --workspace) EXPECT_WORKSPACE_PATH=1 ;;
    esac
done
if [ "${EXPECT_WORKSPACE_PATH}" -eq 1 ]; then
    echo "Missing value for --workspace" >&2
    exit 1
fi

mkdir -p "${WORKSPACE_DIR}"

# Change ownership of relevant directories, including the workspace directory
echo "Adjusting ownership of /opt/sourceflow, /home/sourceflow/, and ${WORKSPACE_DIR}"
chown -R "${PUID}:${PGID}" /opt/sourceflow
chown -R "${PUID}:${PGID}" /home/sourceflow/
chown -R "${PUID}:${PGID}" "${WORKSPACE_DIR}"

# Switch to the newly created user and start the main process with all arguments
echo "Starting SourceFlow with UID:${PUID} and GID:${PGID} in workspace ${WORKSPACE_DIR}"
exec su-exec "${PUID}:${PGID}" /opt/sourceflow/kernel "$@" --workspace="${WORKSPACE_DIR}"
