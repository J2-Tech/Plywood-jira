const fs = require('fs');
const path = require('path');
const selfsigned = require('selfsigned');
const forge = require('node-forge');
const { URL } = require('url');
const { SSL_CERT_PATH, SSL_KEY_PATH, JIRA_OAUTH_CALLBACK_URL } = process.env;

function generateSelfSignedCert() {
    const certDir = path.dirname(SSL_CERT_PATH);
    if (!fs.existsSync(certDir)) {
        fs.mkdirSync(certDir, { recursive: true });
    }

    const domain = new URL(JIRA_OAUTH_CALLBACK_URL).hostname;
    const certExists = fs.existsSync(SSL_CERT_PATH) && fs.existsSync(SSL_KEY_PATH);
    let certExpired = false;

    if (certExists) {
        try {
            const certPem = fs.readFileSync(SSL_CERT_PATH, 'utf8');
            const cert = forge.pki.certificateFromPem(certPem);
            const expiryDate = cert.validity.notAfter;
            certExpired = expiryDate < new Date();
            console.log('Certificate expiry date:', expiryDate);
        } catch (error) {
            console.error('Error checking certificate expiry:', error);
        }
    }

    if (!certExists || certExpired) {
        console.log('Generating self-signed SSL certificate...');
        const attrs = [{ name: 'commonName', value: domain }];
        const pems = selfsigned.generate(attrs, { days: 365 });
        fs.writeFileSync(SSL_CERT_PATH, pems.cert);
        fs.writeFileSync(SSL_KEY_PATH, pems.private);
        console.log('Self-signed SSL certificate generated.');
    }
}

module.exports = { generateSelfSignedCert };