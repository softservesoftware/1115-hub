# Infrastructure Testing Readme
We currently have the following core testing capabilities:
- uptime testing/ canary
- load testing


## Uptime/ Canary
This will attempt an SFTP connection with a provided URL every 10 seconds. If the connection fails, it will audibly alert that the connection has failed.

## Load Testing
This will transfer files from a provided local directory into a given user's ingress directory every n seconds (n being a provided interval). 