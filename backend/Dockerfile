FROM node:18-alpine

RUN apk add --no-cache git docker-cli docker-cli-compose

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY src/ ./src/

RUN mkdir -p /app/data /app/public

EXPOSE 3001

CMD ["node", "src/index.js"]
