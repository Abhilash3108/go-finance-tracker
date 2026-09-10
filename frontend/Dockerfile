# -----------------------------
# Stage 1 - Build the React App
# -----------------------------
FROM node:18-alpine AS build

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy all source files and build the application
COPY . .

# VITE_API_URL is baked into the JS bundle at build time.
# Railway passes it as a build-time variable via the dashboard.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# -----------------------------
# Stage 2 - Serve with Nginx
# -----------------------------
FROM nginx:alpine

# Remove the default Nginx configuration and replace it with our custom config
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the compiled React application to Nginx's serving directory
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Expose default port (Railway overrides via $PORT at runtime)
EXPOSE 80

# Entrypoint swaps nginx listen port to Railway's $PORT, then starts nginx
CMD ["/docker-entrypoint.sh"]
