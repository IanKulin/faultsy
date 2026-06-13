FROM node:26-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY index.js db.js session-store.js ./
COPY routes/ routes/
COPY middleware/ middleware/
COPY lib/ lib/
COPY views/ views/
COPY public/ public/

EXPOSE 3000

CMD ["node", "index.js"]
