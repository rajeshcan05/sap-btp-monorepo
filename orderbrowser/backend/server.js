const express = require('express');
const nodemailer = require('nodemailer');
const { getDestination } = require('@sap-cloud-sdk/connectivity');

const app = express();
app.use(express.json());

app.post('/send-mail', async (req, res) => {
    try {
        console.log("--- Email Request Started ---");

        // 1. Fetch Destination
        const dest = await getDestination({ destinationName: "MyMailService" });
        if (!dest) {
            throw new Error("Destination 'MyMailService' not found in BTP.");
        }

        // 2. ROBUST CREDENTIAL CHECK (Updated)
        // We now check 'mail.user' and 'mail.password' which you added in Additional Properties
        const sUser = dest.username || dest.originalProperties['mail.user'] || dest.originalProperties.User;
        const sPass = dest.password || dest.originalProperties['mail.password'] || dest.originalProperties.Password;

        console.log("Destination loaded.");
        console.log("User found: " + (sUser ? "YES" : "NO"));
        console.log("Password found: " + (sPass ? "YES" : "NO"));

        if (!sUser || !sPass) {
            // If this fails, it sends back a clear error about what is missing
            throw new Error("Credentials still missing! Please add 'mail.user' and 'mail.password' in BTP Additional Properties.");
        }

        // 3. Configure Nodemailer
        let transporter = nodemailer.createTransport({
            host: dest.originalProperties['mail.smtp.host'] || 'smtp.gmail.com',
            port: dest.originalProperties['mail.smtp.port'] || 587,
            secure: false, 
            auth: {
                user: sUser, 
                pass: sPass 
            },
            tls: { rejectUnauthorized: false }
        });

        // 4. Send Email
        let info = await transporter.sendMail({
            from: `"Order Browser AI" <${sUser}>`, 
            to: req.body.to,
            subject: req.body.subject,
            text: req.body.text
        });

        console.log("Email sent successfully. ID: %s", info.messageId);
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