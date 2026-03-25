const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8 }); 

const ARQUIVO_DADOS = 'dados_overlay.json';

// ==========================================
// BANCO DE DADOS PADRÃO
// ==========================================
const dadosPadrao = {
    nomeEsq: "MÁRCIO", subEsq: "Vasconcelos", xEsq: 50, yEsq: 120, corNomeEsq: "#000000", bgNomeEsq: "#f0b00a", borderEsq: "#000000", corSubEsq: "#003366", bgSubEsq: "transparent",
    cestaUrl: "", cestaW: 100, cestaH: 100, cestaX: 50, cestaY: 220,
    nomeDir: "JOÃO", subDir: "Silva", xDir: 50, yDir: 120, corNomeDir: "#000000", bgNomeDir: "#f0b00a", borderDir: "#000000", corSubDir: "#003366", bgSubDir: "transparent",
    pixUrl: "", pixW: 100, pixH: 100, pixX: 50, pixY: 220,
    logoCentroUrl: "", logoCentroW: 250, logoCentroH: 250, logoCentroX: 960, logoCentroY: 500,
    timerMensagem: "A LIVE COMEÇA EM:", timerMensagemCor: "#ffffff", timerMensagemSize: 32,
    timerMinutos: 5, timerSegundos: 0, timerCor: "#f0b00a", timerBg: "rgba(0,0,0,0.7)", timerSize: 90, timerX: 960, timerY: 200, 
    tickerText: "Curta, compartilhe e comente! Concorra ao livro...", corTicker: "#ffffff", bgTicker: "#000000", bgOrangeBox: "#d48e00", corOrangeBox: "#333333",
    tickerX: 0, tickerY: 0, tickerW: "" // Variável Largura (W) do Ticker adicionada!
};

function lerDados() { try { if (fs.existsSync(ARQUIVO_DADOS)) return JSON.parse(fs.readFileSync(ARQUIVO_DADOS)); } catch (e) {} return dadosPadrao; }
function salvarDados(dados) { try { fs.writeFileSync(ARQUIVO_DADOS, JSON.stringify(dados, null, 2)); } catch (e) {} }

let timerInterval = null; let timeRemaining = 0; let timerRunning = false;
function formataTempo(segundosTotais) { const m = Math.floor(segundosTotais / 60).toString().padStart(2, '0'); const s = (segundosTotais % 60).toString().padStart(2, '0'); return m + ':' + s; }
const initialDb = lerDados(); timeRemaining = (parseInt(initialDb.timerMinutos) || 0) * 60 + (parseInt(initialDb.timerSegundos) || 0);

// ==========================================
// 1. CÓDIGO HTML DO OVERLAY (OBS)
// ==========================================
const overlayHTML = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8"><title>Overlay da Live</title><script src="/socket.io/socket.io.js"></script>
    <style>
        body { margin: 0; padding: 0; overflow: hidden; background-color: transparent; font-family: 'Segoe UI', sans-serif; height: 100vh;}
        .lower-third-container { position: absolute; opacity: 0; transition: opacity 0.8s ease-in-out, transform 0.8s ease-in-out; display: flex; flex-direction: column; gap: 5px; padding-bottom: 5px; z-index: 5;}
        .name-bg { padding: 10px 20px; border-radius: 0 4px 4px 0; display: inline-block; white-space: nowrap;}
        .sub-bg { padding: 8px 15px; border-radius: 4px; display: inline-block; white-space: nowrap;}
        #box-esquerda { transform: translateX(-30px); border-left-style: solid; border-left-width: 12px; align-items: flex-start; } #box-esquerda.visible { opacity: 1; transform: translateX(0); }
        #box-direita { transform: translateX(30px); align-items: flex-end; border-right-style: solid; border-right-width: 12px; } #box-direita .name-bg { border-radius: 4px 0 0 4px; } #box-direita.visible { opacity: 1; transform: translateX(0); }
        h1 { margin: 0; font-size: 38px; text-transform: uppercase; transition: color 0.3s; letter-spacing: 1px;}
        p { margin: 0; font-size: 24px; transition: color 0.3s; font-weight: 600;}
        #ticker-wrapper { position: fixed; bottom: 50px; left: 0; width: 100%; height: 64px; display: flex; align-items: center; overflow: hidden; border-top: 1px solid rgba(255,255,255,0.1); font-size: 20px; transform: translateY(100%); opacity: 0; transition: all 0.8s ease-in-out; z-index: 20; }
        #ticker-wrapper.visible { transform: translateY(0); opacity: 1; } 
        #ticker-orange-box { height: 100%; display: flex; align-items: center; padding: 0 20px; font-weight: bold; font-size: 18px; white-space: nowrap; transition: all 0.3s; }
        #ticker-scroller { flex: 1; height: 100%; overflow: hidden; position: relative; }
        #ticker-scroller span { position: absolute; white-space: nowrap; display: inline-block; padding-left: 20px; line-height: 64px; animation: ticker-scroll 25s linear infinite; transition: color 0.3s; }
        @keyframes ticker-scroll { 0% { transform: translateX(100vw); } 100% { transform: translateX(-100%); } }
        .logo-img { position: absolute; opacity: 0; transition: opacity 0.8s ease-in-out, transform 0.8s ease-in-out; object-fit: contain; z-index: 10; } .logo-img.visible { opacity: 1; }
        #img-cesta { transform: scale(0.9); } #img-cesta.visible { transform: scale(1); } #img-pix { transform: scale(0.9); } #img-pix.visible { transform: scale(1); }
        .camada-centro { position: absolute; transform: translateX(-50%); opacity: 0; transition: opacity 0.8s ease-in-out; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 15; } .camada-centro.visible { opacity: 1; }
        #img-centro { object-fit: contain; }
        #timer-bg-wrapper { background-color: rgba(0,0,0,0.7); padding: 20px 40px; border-radius: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; box-shadow: 0 8px 30px rgba(0,0,0,0.5); width: fit-content; white-space: nowrap; }
        #msg-centro { margin: 0 0 5px 0; font-weight: bold; text-align: center; transition: font-size 0.3s; }
        #timer-display { margin: 0; font-weight: bold; font-family: monospace; line-height: 1; text-align: center; transition: color 0.3s, font-size 0.3s;}
    </style>
</head>
<body>
    <img id="img-cesta" class="logo-img" src=""><img id="img-pix" class="logo-img" src="">
    <div id="box-logo-centro" class="camada-centro"><img id="img-centro" src="" style="display:none;"></div>
    <div id="box-timer-centro" class="camada-centro"><div id="timer-bg-wrapper"><h2 id="msg-centro"></h2><div id="timer-display">00:00</div></div></div>
    <div id="box-esquerda" class="lower-third-container"><div id="name-bg-1" class="name-bg"><h1 id="nome1"></h1></div><div id="sub-bg-1" class="sub-bg"><p id="sub1"></p></div></div>
    <div id="box-direita" class="lower-third-container"><div id="name-bg-2" class="name-bg"><h1 id="nome2"></h1></div><div id="sub-bg-2" class="sub-bg"><p id="sub2"></p></div></div>
    <div id="ticker-wrapper"><div id="ticker-orange-box">Participe da Live</div><div id="ticker-scroller"><span id="ticker-text"></span></div></div>

    <script>
        const socket = io();
        const elementos = { 'textosEsq': document.getElementById('box-esquerda'), 'textosDir': document.getElementById('box-direita'), 'cesta': document.getElementById('img-cesta'), 'pix': document.getElementById('img-pix'), 'ticker': document.getElementById('ticker-wrapper'), 'centro': [document.getElementById('box-logo-centro'), document.getElementById('box-timer-centro')] };
        const tickerBox = document.getElementById('ticker-orange-box'), tickerTextSpan = document.getElementById('ticker-text'), elNome1 = document.getElementById('nome1'), elSub1 = document.getElementById('sub1'), nameBg1 = document.getElementById('name-bg-1'), subBg1 = document.getElementById('sub-bg-1'), elNome2 = document.getElementById('nome2'), elSub2 = document.getElementById('sub2'), nameBg2 = document.getElementById('name-bg-2'), subBg2 = document.getElementById('sub-bg-2'), imgCentro = document.getElementById('img-centro'), timerDisplay = document.getElementById('timer-display'), msgCentro = document.getElementById('msg-centro'), timerBgWrapper = document.getElementById('timer-bg-wrapper');
        
        function hexToRgba(hex, alpha) { if (!hex || hex === 'transparent') return 'transparent'; if (hex.startsWith('rgba')) return hex; let r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16); return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')'; }

        socket.on('syncData', (data) => {
            elNome1.innerText = data.nomeEsq; elSub1.innerText = data.subEsq; elNome2.innerText = data.nomeDir; elSub2.innerText = data.subDir; elNome1.style.color = data.corNomeEsq; elSub1.style.color = data.corSubEsq; elNome2.style.color = data.corNomeDir; elSub2.style.color = data.corSubDir; nameBg1.style.backgroundColor = data.bgNomeEsq; subBg1.style.backgroundColor = data.bgSubEsq; elementos.textosEsq.style.borderLeftColor = data.borderEsq; nameBg2.style.backgroundColor = data.bgNomeDir; subBg2.style.backgroundColor = data.bgSubDir; elementos.textosDir.style.borderRightColor = data.borderDir; elementos.textosEsq.style.left = data.xEsq + 'px'; elementos.textosEsq.style.bottom = data.yEsq + 'px'; elementos.textosDir.style.right = data.xDir + 'px'; elementos.textosDir.style.bottom = data.yDir + 'px';
            if(data.cestaUrl) { elementos.cesta.src = data.cestaUrl; elementos.cesta.style.width = data.cestaW + 'px'; elementos.cesta.style.height = data.cestaH + 'px'; elementos.cesta.style.left = data.cestaX + 'px'; elementos.cesta.style.bottom = data.cestaY + 'px'; }
            if(data.pixUrl) { elementos.pix.src = data.pixUrl; elementos.pix.style.width = data.pixW + 'px'; elementos.pix.style.height = data.pixH + 'px'; elementos.pix.style.right = data.pixX + 'px'; elementos.pix.style.bottom = data.pixY + 'px'; }
            elementos.centro[0].style.left = data.logoCentroX + 'px'; elementos.centro[0].style.bottom = data.logoCentroY + 'px'; if(data.logoCentroUrl) { imgCentro.src = data.logoCentroUrl; imgCentro.style.width = data.logoCentroW + 'px'; imgCentro.style.height = data.logoCentroH + 'px'; imgCentro.style.display = 'block'; } else { imgCentro.style.display = 'none'; }
            elementos.centro[1].style.left = data.timerX + 'px'; elementos.centro[1].style.bottom = data.timerY + 'px';
            if(data.timerMensagem) { msgCentro.innerText = data.timerMensagem; msgCentro.style.display = 'block'; } else { msgCentro.style.display = 'none'; }
            msgCentro.style.color = data.timerMensagemCor; msgCentro.style.fontSize = (data.timerMensagemSize || 32) + 'px'; timerDisplay.style.color = data.timerCor; timerDisplay.style.fontSize = (data.timerSize || 90) + 'px'; timerBgWrapper.style.backgroundColor = data.timerBg;
            
            tickerTextSpan.innerText = data.tickerText; tickerTextSpan.style.color = data.corTicker; tickerBox.style.backgroundColor = data.bgOrangeBox; tickerBox.style.color = data.corOrangeBox; elementos.ticker.style.backgroundColor = hexToRgba(data.bgTicker, 0.7);
            
            // TICKER X, Y, E LARGURA (Efeito Pílula)
            elementos.ticker.style.left = (data.tickerX || 0) + 'px';
            elementos.ticker.style.bottom = (data.tickerY || 0) + 'px';
            if(data.tickerW && data.tickerW !== "") {
                elementos.ticker.style.width = data.tickerW + 'px';
                elementos.ticker.style.borderRadius = '12px';
                tickerBox.style.borderRadius = '12px 0 0 12px';
                elementos.ticker.style.borderTop = 'none';
            } else {
                elementos.ticker.style.width = '100%';
                elementos.ticker.style.borderRadius = '0';
                tickerBox.style.borderRadius = '0';
            }
        });

        socket.on('timerTick', (t) => { timerDisplay.innerText = t; });
        socket.on('toggleVisibility', ({ idElemento, mostrar }) => { if (elementos[idElemento]) { let els = Array.isArray(elementos[idElemento]) ? elementos[idElemento] : [elementos[idElemento]]; els.forEach(el => mostrar ? el.classList.add('visible') : el.classList.remove('visible')); } });
        socket.on('showAll', () => { Object.values(elementos).forEach(el => { if(Array.isArray(el)) el.forEach(e => e.classList.add('visible')); else el.classList.add('visible'); }); });
        socket.on('hideAll', () => { Object.values(elementos).forEach(el => { if(Array.isArray(el)) el.forEach(e => e.classList.remove('visible')); else el.classList.remove('visible'); }); });
    </script>
</body>
</html>
`;

// ==========================================
// 2. CÓDIGO HTML DO PAINEL ADMIN
// ==========================================
const adminHTML = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8"><title>Painel Admin</title><script src="/socket.io/socket.io.js"></script>
    <style>
        body { font-family: Arial; background: #f4f4f9; padding: 20px; } .top-bar { display: flex; justify-content: space-between; align-items: center; max-width: 1000px; margin-bottom: 20px;} .top-bar-actions { display: flex; gap: 10px; align-items: center; } .btn-link { background: #333; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; font-weight: bold; cursor: pointer; display: inline-block; border: none; font-size: 14px;} .btn-link:hover { opacity: 0.9; } .container { display: flex; gap: 20px; max-width: 1000px; margin-bottom: 20px; align-items: flex-start; } .card { background: white; padding: 20px; border-radius: 8px; flex: 1; box-shadow: 0 2px 5px rgba(0,0,0,0.1); } .controls { background: white; padding: 20px; border-radius: 8px; max-width: 1000px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); text-align: center;} input[type="text"], input[type="number"], textarea { width: 100%; padding: 10px; margin: 4px 0 10px 0; border: 1px solid #ccc; box-sizing: border-box; border-radius: 4px; } input[type="file"] { width: 100%; padding: 8px; margin: 4px 0 10px 0; border: 1px dashed #ccc; box-sizing: border-box; background: #fafafa; border-radius: 4px; cursor: pointer; } input[type="color"] { width: 45px; height: 38px; padding: 0; margin: 4px 0 10px 0; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; } select { padding: 10px; width: 100%; margin: 4px 0 10px 0; border: 1px solid #ccc; border-radius: 4px; } .flex-row { display: flex; gap: 10px; align-items: center; } .flex-row > div:first-child { flex: 1; } .pos-grid { display: flex; gap: 10px; margin-top: 10px; padding-top: 15px; border-top: 1px solid #eee;} .pos-grid div { flex: 1; } textarea { height: 60px; resize: none; } button { padding: 15px; border: none; cursor: pointer; color: white; font-weight: bold; border-radius: 4px; font-size: 16px; transition: 0.2s;} button:hover { opacity: 0.9; } .btn-save { background: #007bff; width: 100%; font-size: 18px;} label { font-size: 12px; font-weight: bold; color: #666; display: block; } h3 { margin-top: 0; color: #e94560; font-size: 18px; border-bottom: 2px solid #f0f0f0; padding-bottom: 10px;} .section-title { margin-top: 20px; font-size: 14px; font-weight: bold; color: #333; border-bottom: 1px solid #eee; padding-bottom: 5px; margin-bottom: 10px; } .card-ticker { background: white; padding: 20px; border-radius: 8px; max-width: 1000px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); margin-bottom: 20px; border-left: 5px solid #007bff;} .card-centro { background: white; padding: 20px; border-radius: 8px; max-width: 1000px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); margin-bottom: 20px; border-left: 5px solid #4CAF50;} .status { color: #007bff; font-size: 14px; display: none; margin-top: 15px; font-weight: bold;}
    </style>
</head>
<body>
    <div class="top-bar"><h2>Painel de Configuração (Produtor)</h2><div class="top-bar-actions"><a href="/backup" class="btn-link" style="background: #2196F3;">💾 Backup</a><label for="file-restore" class="btn-link" style="background: #FF9800; margin: 0;">📂 Restore</label><input type="file" id="file-restore" accept=".json" style="display: none;"><a href="/operador" target="_blank" class="btn-link" style="background: #4CAF50;">▶️ Operador</a></div></div>
    
    <div class="card-centro">
        <h3 style="color: #4CAF50;">Centro (Timer Countdown & Logo)</h3>
        <div class="container" style="box-shadow: none; padding: 0; margin: 0;">
            <div style="flex: 1;"><div class="section-title">💬 Mensagem e Fundo</div><div class="pos-grid"><div style="flex: 2;"><label>Texto da Msg</label><input type="text" id="timer-mensagem"></div><div><label>Cor Texto</label><input type="color" id="timer-msg-cor"></div><div><label>Tam. Texto</label><input type="number" id="timer-msg-size" value="32"></div></div><div class="pos-grid"><div><label>Cor do Relógio</label><input type="color" id="timer-cor"></div><div><label>Fundo (RGBA)</label><input type="color" id="timer-bg"></div><div><label>Tam. Relógio</label><input type="number" id="timer-size" value="90"></div></div><div class="section-title">⏱️ Relógio e Posição</div><div class="pos-grid"><div><label>Min Iniciais</label><input type="number" id="timer-minutos" value="5"></div><div><label>Seg Iniciais</label><input type="number" id="timer-segundos" value="0"></div></div><div class="pos-grid" style="margin-top: 15px;"><div><label>Pos X (Centro=960)</label><input type="number" id="timer-x" value="960"></div><div><label>Pos Y (Altura)</label><input type="number" id="timer-y" value="200"></div></div></div>
            <div style="flex: 1; border-left: 1px solid #eee; padding-left: 20px;"><div class="section-title">🖼️ Imagem Central</div><label>Upload (opcional)</label><input type="file" id="file-centro" accept="image/png, image/jpeg, image/gif"><input type="hidden" id="centro-base64"><div class="pos-grid"><div><label>Largura (W)</label><input type="number" id="centro-w"></div><div><label>Altura (H)</label><input type="number" id="centro-h"></div></div><div class="pos-grid" style="margin-top: 15px;"><div><label>Pos X (Centro=960)</label><input type="number" id="centro-x" value="960"></div><div><label>Pos Y (Altura)</label><input type="number" id="centro-y" value="500"></div></div></div>
        </div>
    </div>

    <div class="card-ticker">
        <h3 style="color: #007bff;">Barra de Rodapé (Ticker)</h3>
        <div class="flex-row"><div><label>Texto</label><textarea id="input-ticker"></textarea></div><div><label>Cor Texto</label><input type="color" id="cor-ticker"></div><div><label>Fundo Barra</label><input type="color" id="bg-ticker"></div></div>
        <div class="flex-row" style="margin-top: 10px;"><div style="flex: 0; white-space: nowrap;"><label>Caixa Laranja:</label></div><div><label>Cor Fundo</label><input type="color" id="bg-orange"></div><div><label>Cor Texto</label><input type="color" id="cor-orange"></div></div>
        <div class="pos-grid" style="margin-top: 15px;">
            <div><label>Posição X</label><input type="number" id="ticker-x" value="0"></div>
            <div><label>Posição Y (Altura)</label><input type="number" id="ticker-y" value="0"></div>
            <div><label>Largura (Deixe vazio para 100%)</label><input type="number" id="ticker-w" placeholder="Ex: 1500"></div>
        </div>
    </div>
    
    <div class="container">
        <div class="card"><h3>Pessoa 1 (Esq)</h3><div class="section-title">👤 Textos</div><div class="flex-row"><div><label>Nome</label><input type="text" id="input-nome1"></div><div><label>Cor</label><input type="color" id="cor-nome1"></div><div><label>Fundo</label><input type="color" id="bg-nome1"></div></div><div class="flex-row"><div><label>Cargo</label><input type="text" id="input-sub1"></div><div><label>Cor</label><input type="color" id="cor-sub1"></div><div><label>Fundo</label><select id="bg-sub1"><option value="transparent">Transparente</option><option value="rgba(0,0,0,0.5)">Escuro</option></select></div></div><div class="flex-row"><div><label>Borda Lateral</label><input type="color" id="border-esq"></div></div><div class="pos-grid"><div><label>Pos X</label><input type="number" id="input-x1"></div><div><label>Pos Y</label><input type="number" id="input-y1"></div></div><div class="section-title">🧺 Cesta Básica</div><input type="file" id="file-cesta" accept="image/*"><input type="hidden" id="cesta-base64"><div class="pos-grid"><div><label>Larg. (W)</label><input type="number" id="cesta-w"></div><div><label>Alt. (H)</label><input type="number" id="cesta-h"></div></div><div class="pos-grid"><div><label>Pos X</label><input type="number" id="cesta-x"></div><div><label>Pos Y</label><input type="number" id="cesta-y"></div></div></div>
        <div class="card"><h3>Pessoa 2 (Dir)</h3><div class="section-title">👤 Textos</div><div class="flex-row"><div><label>Nome</label><input type="text" id="input-nome2"></div><div><label>Cor</label><input type="color" id="cor-nome2"></div><div><label>Fundo</label><input type="color" id="bg-nome2"></div></div><div class="flex-row"><div><label>Cargo</label><input type="text" id="input-sub2"></div><div><label>Cor</label><input type="color" id="cor-sub2"></div><div><label>Fundo</label><select id="bg-sub2"><option value="transparent">Transparente</option><option value="rgba(0,0,0,0.5)">Escuro</option></select></div></div><div class="flex-row"><div><label>Borda Lateral</label><input type="color" id="border-dir"></div></div><div class="pos-grid"><div><label>Pos X</label><input type="number" id="input-x2"></div><div><label>Pos Y</label><input type="number" id="input-y2"></div></div><div class="section-title">💸 PIX (QR Code)</div><input type="file" id="file-pix" accept="image/*"><input type="hidden" id="pix-base64"><div class="pos-grid"><div><label>Larg. (W)</label><input type="number" id="pix-w"></div><div><label>Alt. (H)</label><input type="number" id="pix-h"></div></div><div class="pos-grid"><div><label>Pos X</label><input type="number" id="pix-x"></div><div><label>Pos Y</label><input type="number" id="pix-y"></div></div></div>
    </div>
    <div class="controls"><button class="btn-save" onclick="salvarTudo()">💾 SALVAR TODAS AS CONFIGURAÇÕES</button><div id="status-nomes" class="status">✓ Dados salvos!</div></div>

    <script>
        const socket = io({ maxHttpBufferSize: 1e8 });
        function setupImageUpload(inputId, hiddenId) { document.getElementById(inputId).addEventListener('change', function(e) { const file = e.target.files[0]; if (file) { const reader = new FileReader(); reader.onload = function(event) { document.getElementById(hiddenId).value = event.target.result; }; reader.readAsDataURL(file); } else { document.getElementById(hiddenId).value = ""; } }); }
        setupImageUpload('file-cesta', 'cesta-base64'); setupImageUpload('file-pix', 'pix-base64'); setupImageUpload('file-centro', 'centro-base64');

        document.getElementById('file-restore').addEventListener('change', function(e) { const file = e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = function(event) { try { const jsonData = JSON.parse(event.target.result); socket.emit('saveData', jsonData); alert('Restore com sucesso!'); } catch (err) { alert('Erro no arquivo.'); } }; reader.readAsText(file); e.target.value = ''; });

        socket.on('carregarDados', (dados) => {
            const setVal = (id, val) => { if(document.getElementById(id)) document.getElementById(id).value = val !== undefined ? val : ""; };
            setVal('input-nome1', dados.nomeEsq); setVal('input-sub1', dados.subEsq); setVal('cor-nome1', dados.corNomeEsq); setVal('bg-nome1', dados.bgNomeEsq); setVal('cor-sub1', dados.corSubEsq); setVal('border-esq', dados.borderEsq); setVal('input-x1', dados.xEsq); setVal('input-y1', dados.yEsq);
            setVal('cesta-base64', dados.cestaUrl); setVal('cesta-w', dados.cestaW); setVal('cesta-h', dados.cestaH); setVal('cesta-x', dados.cestaX); setVal('cesta-y', dados.cestaY);
            setVal('input-nome2', dados.nomeDir); setVal('input-sub2', dados.subDir); setVal('cor-nome2', dados.corNomeDir); setVal('bg-nome2', dados.bgNomeDir); setVal('cor-sub2', dados.corSubDir); setVal('border-dir', dados.borderDir); setVal('input-x2', dados.xDir); setVal('input-y2', dados.yDir);
            setVal('pix-base64', dados.pixUrl); setVal('pix-w', dados.pixW); setVal('pix-h', dados.pixH); setVal('pix-x', dados.pixX); setVal('pix-y', dados.pixY);
            setVal('input-ticker', dados.tickerText); setVal('cor-ticker', dados.corTicker); setVal('bg-ticker', dados.bgTicker); setVal('bg-orange', dados.bgOrangeBox); setVal('cor-orange', dados.corOrangeBox);
            setVal('ticker-x', dados.tickerX || 0); setVal('ticker-y', dados.tickerY || 0); setVal('ticker-w', dados.tickerW || "");
            setVal('centro-base64', dados.logoCentroUrl); setVal('centro-w', dados.logoCentroW); setVal('centro-h', dados.logoCentroH); setVal('centro-x', dados.logoCentroX); setVal('centro-y', dados.logoCentroY);
            setVal('timer-mensagem', dados.timerMensagem); setVal('timer-msg-cor', dados.timerMensagemCor); setVal('timer-msg-size', dados.timerMensagemSize || 32);
            setVal('timer-minutos', dados.timerMinutos); setVal('timer-segundos', dados.timerSegundos); setVal('timer-cor', dados.timerCor); setVal('timer-bg', dados.timerBg); setVal('timer-size', dados.timerSize || 90); setVal('timer-x', dados.timerX || 960); setVal('timer-y', dados.timerY || 200); 
            
            const sel1 = document.getElementById('bg-sub1'); if(Array.from(sel1.options).some(opt => opt.value === dados.bgSubEsq)) sel1.value = dados.bgSubEsq;
            const sel2 = document.getElementById('bg-sub2'); if(Array.from(sel2.options).some(opt => opt.value === dados.bgSubDir)) sel2.value = dados.bgSubDir;
        });

        function salvarTudo() {
            const val = (id) => document.getElementById(id).value;
            socket.emit('saveData', {
                nomeEsq: val('input-nome1'), corNomeEsq: val('cor-nome1'), bgNomeEsq: val('bg-nome1'), subEsq: val('input-sub1'), corSubEsq: val('cor-sub1'), bgSubEsq: val('bg-sub1'), borderEsq: val('border-esq'), xEsq: val('input-x1'), yEsq: val('input-y1'),
                cestaUrl: val('cesta-base64'), cestaW: val('cesta-w'), cestaH: val('cesta-h'), cestaX: val('cesta-x'), cestaY: val('cesta-y'),
                nomeDir: val('input-nome2'), corNomeDir: val('cor-nome2'), bgNomeDir: val('bg-nome2'), subDir: val('input-sub2'), corSubDir: val('cor-sub2'), bgSubDir: val('bg-sub2'), borderDir: val('border-dir'), xDir: val('input-x2'), yDir: val('input-y2'),
                pixUrl: val('pix-base64'), pixW: val('pix-w'), pixH: val('pix-h'), pixX: val('pix-x'), pixY: val('pix-y'),
                tickerText: val('input-ticker'), corTicker: val('cor-ticker'), bgTicker: val('bg-ticker'), bgOrangeBox: val('bg-orange'), corOrangeBox: val('cor-orange'),
                tickerX: val('ticker-x'), tickerY: val('ticker-y'), tickerW: val('ticker-w'),
                logoCentroUrl: val('centro-base64'), logoCentroW: val('centro-w'), logoCentroH: val('centro-h'), logoCentroX: val('centro-x'), logoCentroY: val('centro-y'),
                timerMensagem: val('timer-mensagem'), timerMensagemCor: val('timer-msg-cor'), timerMensagemSize: val('timer-msg-size'),
                timerMinutos: val('timer-minutos'), timerSegundos: val('timer-segundos'), timerCor: val('timer-cor'), timerBg: val('timer-bg'), timerSize: val('timer-size'), timerX: val('timer-x'), timerY: val('timer-y')
            });
            const el = document.getElementById('status-nomes'); el.style.display = 'block'; setTimeout(() => el.style.display = 'none', 3000);
        }
    </script>
</body>
</html>
`;

// ==========================================
// 3. CÓDIGO HTML DO OPERADOR (RESPONSIVO)
// ==========================================
const operadorHTML = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"><title>Painel do Operador</title><script src="/socket.io/socket.io.js"></script>
    <style>
        body { font-family: sans-serif; background: #222; color: white; padding: 20px 10px; display: flex; flex-direction: column; align-items: center; min-height: 100vh; margin: 0;}
        .card { background: #333; padding: 20px; border-radius: 12px; max-width: 500px; width: 100%; text-align: center; margin-bottom: 20px; transition: max-width 0.3s ease, padding 0.3s ease; box-sizing: border-box;}
        h2 { color: #f0b00a; margin-top: 0; border-bottom: 1px solid #555; padding-bottom: 15px;}
        .preview-box { background: #111; padding: 15px; border-radius: 8px; margin: 0 0 20px 0; border-left: 5px solid #007bff; display: flex; flex-direction: column; gap: 5px;}
        .preview-box p { margin: 5px 0; font-size: 14px; color: #ccc;}
        .preview-box strong { color: white; font-size: 15px;}
        
        /* Controles Base (Mobile First) */
        .controls-wrapper { display: flex; flex-direction: column; gap: 10px; }
        .coluna { display: flex; flex-direction: column; gap: 10px; }
        .control-row { display: flex; justify-content: space-between; align-items: center; background: #444; padding: 12px 15px; border-radius: 8px;}
        .control-row.timer-box { flex-direction: column; align-items: stretch; border-left: 5px solid #4CAF50; background: #3a3a3a;}
        .control-row span { font-size: 16px; font-weight: bold; flex: 1; text-align: left;}
        
        /* Botões */
        button { border: none; cursor: pointer; color: white; font-weight: bold; border-radius: 8px; transition: opacity 0.2s;}
        button:hover { opacity: 0.9; }
        .btn-sm-on { background: #4CAF50; padding: 12px 0; width: 65px; border-bottom: 3px solid #388E3C; margin-left: 5px;}
        .btn-sm-off { background: #f44336; padding: 12px 0; width: 65px; border-bottom: 3px solid #d32f2f; margin-left: 5px;}
        .inactive { background: #555 !important; border-bottom-color: #333 !important; color: #888 !important; opacity: 0.5;}
        .btn-timer { flex: 1; padding: 12px; font-size: 14px; border-radius: 6px;}
        
        .botoes-massa { display: flex; flex-direction: column; gap: 10px; margin-top: 20px; }
        .btn-lg-on { background: #4CAF50; padding: 20px; width: 100%; font-size: 16px;}
        .btn-lg-off { background: #f44336; padding: 20px; width: 100%; font-size: 16px;}
        .btn-link { display: inline-block; margin-top: 25px; color: #888; text-decoration: underline;}

        /* --- MEDIA QUERY: RESPONSIVO PARA PC/TABLET --- */
        @media (min-width: 768px) {
            .card { max-width: 950px; padding: 30px; }
            .preview-box { flex-direction: row; justify-content: space-around; align-items: center; }
            .controls-wrapper { display: grid; grid-template-columns: 1fr 1.2fr 1fr; gap: 20px; align-items: start; }
            .coluna-ticker { grid-column: 1 / -1; } /* Faz o ticker ocupar toda a largura do grid */
            .botoes-massa { flex-direction: row; margin-top: 30px; }
            .btn-lg-on, .btn-lg-off { margin: 0; }
        }
    </style>
</head>
<body>
    <div class="card">
        <h2>Mesa de Corte (Operador)</h2>
        
        <div class="preview-box">
            <p>Esq: <strong id="prev-esq">--</strong></p>
            <p>Dir: <strong id="prev-dir">--</strong></p>
        </div>
        
        <div class="controls-wrapper">
            <div class="coluna">
                <div class="control-row">
                    <span>👤 Nome (Esq)</span>
                    <div>
                        <button id="btn-on-textosEsq" class="btn-sm-on inactive" onclick="alternar('textosEsq', true)">ON</button>
                        <button id="btn-off-textosEsq" class="btn-sm-off" onclick="alternar('textosEsq', false)">OFF</button>
                    </div>
                </div>
                <div class="control-row">
                    <span>🧺 Cesta</span>
                    <div>
                        <button id="btn-on-cesta" class="btn-sm-on inactive" onclick="alternar('cesta', true)">ON</button>
                        <button id="btn-off-cesta" class="btn-sm-off" onclick="alternar('cesta', false)">OFF</button>
                    </div>
                </div>
            </div>

            <div class="coluna">
                <div class="control-row timer-box">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span>⏱️ Timer & Logo</span>
                        <div>
                            <button id="btn-on-centro" class="btn-sm-on inactive" onclick="alternar('centro', true)">ON</button>
                            <button id="btn-off-centro" class="btn-sm-off" onclick="alternar('centro', false)">OFF</button>
                        </div>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 15px; background: #111; padding: 10px; border-radius: 8px;">
                        <div id="operador-timer" style="font-size: 28px; font-family: monospace; font-weight: bold; color: #4CAF50;">00:00</div>
                        <div style="display: flex; gap: 5px;">
                            <button class="btn-timer" style="background: #2196F3;" onclick="socket.emit('timerCmd', 'play')" title="Play">▶️</button>
                            <button class="btn-timer" style="background: #FF9800;" onclick="socket.emit('timerCmd', 'pause')" title="Pause">⏸️</button>
                            <button class="btn-timer" style="background: #607D8B;" onclick="socket.emit('timerCmd', 'reset')" title="Resetar">🔄</button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="coluna">
                <div class="control-row">
                    <span>👤 Nome (Dir)</span>
                    <div>
                        <button id="btn-on-textosDir" class="btn-sm-on inactive" onclick="alternar('textosDir', true)">ON</button>
                        <button id="btn-off-textosDir" class="btn-sm-off" onclick="alternar('textosDir', false)">OFF</button>
                    </div>
                </div>
                <div class="control-row">
                    <span>💸 PIX</span>
                    <div>
                        <button id="btn-on-pix" class="btn-sm-on inactive" onclick="alternar('pix', true)">ON</button>
                        <button id="btn-off-pix" class="btn-sm-off" onclick="alternar('pix', false)">OFF</button>
                    </div>
                </div>
            </div>

            <div class="coluna coluna-ticker">
                <div class="control-row" style="border-left: 5px solid #d48e00;">
                    <span>💬 Ticker (Rodapé)</span>
                    <div>
                        <button id="btn-on-ticker" class="btn-sm-on inactive" onclick="alternar('ticker', true)">ON</button>
                        <button id="btn-off-ticker" class="btn-sm-off" onclick="alternar('ticker', false)">OFF</button>
                    </div>
                </div>
            </div>
        </div>

        <div class="botoes-massa">
            <button class="btn-lg-on" onclick="ligarTudo()">🟢 TUDO NO AR</button>
            <button class="btn-lg-off" onclick="desligarTudo()">🔴 TUDO PRO ESCURO</button>
        </div>
        
        <a href="/" target="_blank" class="btn-link">⚙️ Setup (Produtor)</a>
    </div>
    <script>
        const socket = io(); const chavesElementos = ['centro', 'textosEsq', 'cesta', 'textosDir', 'pix', 'ticker'];
        socket.on('carregarDados', (dados) => { document.getElementById('prev-esq').innerText = dados.nomeEsq; document.getElementById('prev-dir').innerText = dados.nomeDir; });
        socket.on('timerTick', (tempoFormatado) => { document.getElementById('operador-timer').innerText = tempoFormatado; });
        function atualizarLuzes(idElemento, estaLigado) { const btnOn = document.getElementById('btn-on-' + idElemento), btnOff = document.getElementById('btn-off-' + idElemento); if (estaLigado) { btnOn.classList.remove('inactive'); btnOff.classList.add('inactive'); } else { btnOn.classList.add('inactive'); btnOff.classList.remove('inactive'); } }
        function alternar(idElemento, mostrar) { socket.emit('toggleAction', { idElemento: idElemento, mostrar: mostrar }); atualizarLuzes(idElemento, mostrar); }
        function ligarTudo() { socket.emit('showAllElements'); chavesElementos.forEach(id => atualizarLuzes(id, true)); }
        function desligarTudo() { socket.emit('hideAllElements'); chavesElementos.forEach(id => atualizarLuzes(id, false)); }
    </script>
</body>
</html>
`;



// ==========================================
// 4. ROTAS E LÓGICA DO SERVIDOR
// ==========================================
app.get('/', (req, res) => res.send(adminHTML));       
app.get('/operador', (req, res) => res.send(operadorHTML)); 
app.get('/overlay', (req, res) => res.send(overlayHTML));   
app.get('/backup', (req, res) => { const arquivo = path.join(__dirname, ARQUIVO_DADOS); fs.existsSync(arquivo) ? res.download(arquivo, 'backup_live.json') : res.status(404).send('Salve primeiro!'); });

io.on('connection', (socket) => {
    const dadosAtuais = lerDados(); socket.emit('carregarDados', dadosAtuais); socket.emit('syncData', dadosAtuais); socket.emit('timerTick', formataTempo(timeRemaining)); 
    socket.on('saveData', (data) => { const db = lerDados(); Object.assign(db, data); salvarDados(db); io.emit('carregarDados', db); io.emit('syncData', db); });
    socket.on('toggleAction', (cmd) => { io.emit('syncData', lerDados()); io.emit('toggleVisibility', cmd); });
    socket.on('showAllElements', () => { io.emit('syncData', lerDados()); io.emit('showAll'); });
    socket.on('hideAllElements', () => { io.emit('hideAll'); });
    socket.on('timerCmd', (cmd) => {
        const db = lerDados();
        if (cmd === 'play') { if (!timerRunning && timeRemaining > 0) { timerRunning = true; timerInterval = setInterval(() => { if (timeRemaining > 0) { timeRemaining--; io.emit('timerTick', formataTempo(timeRemaining)); } else { clearInterval(timerInterval); timerRunning = false; } }, 1000); } } 
        else if (cmd === 'pause') { clearInterval(timerInterval); timerRunning = false; } 
        else if (cmd === 'reset') { clearInterval(timerInterval); timerRunning = false; timeRemaining = (parseInt(db.timerMinutos) || 0) * 60 + (parseInt(db.timerSegundos) || 0); io.emit('timerTick', formataTempo(timeRemaining)); }
    });
});

const PORT = 3100;
server.listen(PORT, () => {
    console.log('Servidor rodando! Ticker com X, Y e W para flutuar.');
    console.log('➡️ Produtor:  http://localhost:' + PORT);
    console.log('➡️ Operador:  http://localhost:' + PORT + '/operador');
});
