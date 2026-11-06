FROM node:24-bookworm-slim
WORKDIR /app
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node tools ./tools
RUN mkdir -p /app/data && chown node:node /app/data
USER node
ENV HOST=0.0.0.0 PORT=3000 SM_DATA_FILE=/app/data/receipts.sqlite
EXPOSE 3000
CMD ["node", "src/main.ts"]
