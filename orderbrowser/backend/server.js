const express = require('express');
const nodemailer = require('nodemailer');
const { getDestination } = require('@sap-cloud-sdk/connectivity');

const app = express();
app.use(express.json());

app.post('/send-mail', async (req, res) => {
    try {
        console.log("Attempting to send email (CLOUD MODE)...");

        // 1. GET CREDENTIALS FROM BTP DESTINATION
        // This securely fetches the User and Password you saved in BTP Cockpit
        const dest = await getDestination({ destinationName: "MyMailService" });

        if (!dest) {
            throw new Error("Destination 'MyMailService' not found. Check BTP Cockpit.");
        }

        console.log("Destination found. Sending as:", dest.username);

        // 2. CONFIGURE NODEMAILER
        // We use the properties from the destination (host, port, user, pass)
        let transporter = nodemailer.createTransport({
            host: dest.originalProperties['mail.smtp.host'] || 'smtp.gmail.com',
            port: dest.originalProperties['mail.smtp.port'] || 587,
            secure: false, 
            auth: {
                user: dest.username, 
                pass: dest.password  // <--- Automatically filled by BTP
            },
            tls: { rejectUnauthorized: false }
        });

        // 3. SEND EMAIL
        let info = await transporter.sendMail({
            from: `"Order Browser AI" <${dest.username}>`, 
            to: req.body.to,
            subject: req.body.subject,
            text: req.body.text
        });

        console.log("Message sent: %s", info.messageId);
        res.status(200).send("Email sent successfully.");

    } catch (error) {
        console.error("Error sending email:", error);
        res.status(500).send("Failed to send email: " + error.message);
    }
});

const port = process.env.PORT || 4004;
app.listen(port, () => {
    console.log(`Mailer service running on port ${port}`);
});