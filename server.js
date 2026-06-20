const express = require('express');
const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Serving the HTML file from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 7860;
const UNIQUE_ID = 'unekid'; // Aapka unique ID

// Default Working Telegram API credentials
const apiId = 6;
const apiHash = "eb06d4abfb49dc3eeb1aeb98ae0f581e";

let client = null;
let isConnected = false;
let globalPhoneCodeHash = "";
let globalPhone = "";
let currentSessionString = "";

// STEP 1: API to Request OTP from Telegram
app.post('/request-code', async (req, res) => {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number is required' });
    }

    try {
        // Clean number and ensure it has '+' sign for Telegram
        let cleanNumber = phoneNumber.replace(/[^0-9+]/g, '');
        if (!cleanNumber.startsWith('+')) {
            cleanNumber = '+' + cleanNumber;
        }
        globalPhone = cleanNumber;

        const stringSession = new StringSession("");
        client = new TelegramClient(stringSession, apiId, apiHash, {
            connectionRetries: 5,
        });

        await client.connect();

        const result = await client.sendCode(
            { apiId, apiHash },
            globalPhone
        );

        globalPhoneCodeHash = result.phoneCodeHash;
        res.json({ success: true, message: 'OTP sent to Telegram!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// STEP 2: API to Verify OTP and Login
app.post('/verify-code', async (req, res) => {
    const { otpCode } = req.body;
    
    if (!otpCode) {
        return res.status(400).json({ error: 'OTP Code is required' });
    }

    try {
        await client.invoke(
            new Api.auth.SignIn({
                phoneNumber: globalPhone,
                phoneCodeHash: globalPhoneCodeHash,
                phoneCode: otpCode
            })
        );

        // Generate the API Key (Session String)
        currentSessionString = client.session.save();
        isConnected = true;

        res.json({ success: true, sessionKey: currentSessionString });
    } catch (err) {
        if (err.message.includes('SESSION_PASSWORD_NEEDED')) {
            res.status(400).json({ error: 'Aapke account par 2-Step Verification (Password) laga hai. Kripya usko Telegram setting se band karke firse try karein.' });
        } else {
            res.status(500).json({ error: err.message });
        }
    }
});

// Main API Route matching your requirement:
// /api/unekid/+910000000000=OTP=8483
app.get('/api/:uniqueid/:payload', async (req, res) => {
    const { uniqueid, payload } = req.params;

    if (uniqueid !== UNIQUE_ID) {
        return res.status(403).json({ success: false, error: 'Invalid Unique ID' });
    }

    let parts = payload.split('=OTP=');
    if (parts.length !== 2) {
        parts = payload.split('=sms='); // fallback just in case
    }
    
    if (parts.length !== 2) {
        return res.status(400).json({ success: false, error: 'Invalid format. Use number=OTP=message' });
    }

    let targetNumber = parts[0].replace(/[^0-9+]/g, '');
    if (!targetNumber.startsWith('+')) {
        targetNumber = '+' + targetNumber;
    }
    
    const messageText = parts[1];

    if (!isConnected || !client) {
        return res.status(500).json({ success: false, error: 'Telegram is not connected to the server yet.' });
    }

    try {
        await client.sendMessage(targetNumber, { message: messageText });
        res.json({ success: true, message: `Sent success to ${targetNumber}` });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Telegram Server is running on port ${PORT}`);
});
