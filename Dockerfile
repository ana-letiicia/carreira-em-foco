FROM node:22-alpine
WORKDIR /app
COPY . .
ENV NODE_ENV=production PORT=8080 DB_PATH=/app/data/carreira.db
EXPOSE 8080
VOLUME ["/app/data"]
CMD ["node", "server.js"]
