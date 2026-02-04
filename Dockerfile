FROM node:22-bookworm AS builder

#
# BUILDER
#

RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"
ENV CLAWDBOT_PYTHON_VENV="/opt/python-env"

RUN corepack enable

WORKDIR /app

ENV TZ=America/Chicago

ARG CLAWDBOT_DOCKER_APT_PACKAGES=""
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive \
    apt-get install -y --no-install-recommends \
    python3-pip python3.11-venv && \
    if [ -n "$CLAWDBOT_DOCKER_APT_PACKAGES" ]; then \
      apt-get install -y --no-install-recommends $CLAWDBOT_DOCKER_APT_PACKAGES; \
    fi && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

# Create python venv
RUN python3 -m venv ${CLAWDBOT_PYTHON_VENV}
RUN ${CLAWDBOT_PYTHON_VENV}/bin/pip install --upgrade pip
RUN ${CLAWDBOT_PYTHON_VENV}/bin/pip install llama-cpp-python pyyaml

# Node dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.json ./
COPY ui/package.json ./ui/package.json
COPY patches ./patches
COPY scripts ./scripts

RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build
# Force pnpm for UI build (Bun may fail on ARM/Synology architectures)
ENV CLAWDBOT_PREFER_PNPM=1
RUN pnpm ui:install
RUN pnpm ui:build


#
# RUNTIME
#

FROM node:22-bookworm AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV TZ=America/Chicago
ENV CLAWDBOT_PYTHON_VENV="/opt/python-env"

# install pip
RUN apt-get update && \
DEBIAN_FRONTEND=noninteractive \
    apt-get install -y --no-install-recommends \
    python3-pip python3.11-venv && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

RUN wget https://github.com/asg017/sqlite-vec/releases/download/v0.1.7-alpha.2/sqlite-vec-0.1.7-alpha.2-loadable-linux-x86_64.tar.gz -O /tmp/sqlite-vec.tar.gz && \
  tar -xzf /tmp/sqlite-vec.tar.gz -C /tmp && \
  cp /tmp/vec0.so /usr/local/lib/vec0.so && \
  rm -rf /tmp/sqlite-vec*

COPY --from=builder /app/package.json .
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/extensions ./extensions
COPY --from=builder /app/skills ./skills
COPY --from=builder /app/docs ./docs
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /opt/python-env ${CLAWDBOT_PYTHON_VENV}

# Copy qmd.py to root
COPY skills/qmd/qmd.py ./qdm.py
COPY qmd-models ./qmd-models

RUN mkdir src
RUN chown -R node:node ./src
RUN chown -R node:node ./dist

RUN npm install -g pnpm
RUN echo "#!/bin/bash\n/usr/local/bin/node /app/dist/index.js \$@" > /usr/local/bin/clawdbot
RUN chmod +x /usr/local/bin/clawdbot
RUN echo "#!/bin/bash\n/opt/python-env/bin/python /app/qdm.py \$@" > /usr/local/bin/qmd
RUN chmod +x /usr/local/bin/qmd


# Install clawdbot-bash wrapper that ensures Python venv is first in PATH
COPY scripts/clawdbot-bash.sh /usr/local/bin/clawdbot-bash
RUN chmod +x /usr/local/bin/clawdbot-bash

# Security hardening: Run as non-root user
# The node:22-bookworm image includes a 'node' user (uid 1000)
# This reduces the attack surface by preventing container escape via root privileges
USER node

RUN echo 'alias ll="ls -lahk --color=auto --group-directories-first"' >> ~/.bashrc

CMD ["node", "dist/index.js"]
