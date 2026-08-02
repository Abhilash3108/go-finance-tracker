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

# Expose port 80
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]