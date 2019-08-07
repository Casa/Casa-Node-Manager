# specify the node base image with your desired version node:<version>
FROM node:8

# install tools
RUN apt-get update \
  && apt-get install -y vim \
  && apt-get install rsync -y

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

RUN npm install
# If you are building your code for production
# RUN npm install --only=production

# Bundle app source
COPY . .

RUN gpg --import ./resources/node-logs.asc

# On x86, download and install docker compose inside the manager imageDockerfile
RUN curl -L https://github.com/docker/compose/releases/download/1.22.0/docker-compose-$(uname -s)-$(uname -m) -o /usr/local/bin/docker-compose
RUN chmod +x /usr/local/bin/docker-compose

LABEL casa=persist

EXPOSE 3000
CMD [ "npm", "start" ]
