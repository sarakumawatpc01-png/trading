FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY tsconfig.json ./
COPY next.config.mjs ./
COPY next-env.d.ts ./
COPY tailwind.config.js ./
COPY postcss.config.js ./
RUN npm install
COPY app ./app
COPY components ./components
COPY lib ./lib
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
