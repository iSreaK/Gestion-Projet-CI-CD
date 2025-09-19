FROM node:20-slim

RUN apt-get update && apt-get install -y nginx && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

COPY nginx/default.conf /etc/nginx/conf.d/default.conf

RUN mkdir -p /var/logs/crud

EXPOSE 80 3000

CMD ["sh", "-c", "node index.js & nginx -g 'daemon off;'"]
