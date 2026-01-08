# LocalWrite Demo - Static Site Deployment
# This Dockerfile expects the dist folder to already be built locally

FROM nginx:alpine

# Copy pre-built files
COPY dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
