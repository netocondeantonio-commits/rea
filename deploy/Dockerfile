FROM node:24-bookworm-slim
WORKDIR /opt/rea
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
USER node
EXPOSE 4174
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4174/api/health').then((response)=>process.exit(response.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "scripts/auto-analyze.mjs", "--serve", "--host", "0.0.0.0", "--port", "4174"]
