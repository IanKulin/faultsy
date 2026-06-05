FROM node:26-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY index.js db.js ./
COPY routes/ routes/
COPY public/ public/

EXPOSE 3000

CMD ["node", "index.js"]
