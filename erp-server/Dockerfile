FROM node:24-alpine
# Layout matches dev repo: erp-server/src + sibling ../src (auto-reminder job imports app modules).
WORKDIR /app/erp-server
ENV NODE_ENV=production
COPY erp-server/package.json erp-server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY erp-server/src ./src
COPY src /app/src
USER node
EXPOSE 8710
CMD ["node", "src/index.js"]