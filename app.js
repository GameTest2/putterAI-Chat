let threads = JSON.parse(localStorage.getItem('game_creator_threads')) || [];
let currentThreadId = null;

window.onload = function() {
    renderHistory();
    if (threads.length > 0) {
        loadThread(threads[0].id);
    } else {
        startNewChat();
    }
};

function startNewChat() {
    currentThreadId = 'thread_' + Date.now();
    const newThread = {
        id: currentThreadId,
        title: '新しいゲーム',
        messages: [],
        lastGameCode: ''
    };
    threads.unshift(newThread);
    saveData();
    renderHistory();
    loadThread(currentThreadId);
}

function renderHistory() {
    const list = document.getElementById('historyList');
    list.innerHTML = '';
    threads.forEach(t => {
        const item = document.createElement('div');
        item.className = `history-item ${t.id === currentThreadId ? 'active' : ''}`;
        item.innerText = t.title;
        item.onclick = () => loadThread(t.id);
        list.appendChild(item);
    });
}

function loadThread(id) {
    currentThreadId = id;
    renderHistory();
    const thread = threads.find(t => t.id === currentThreadId);
    document.getElementById('chatTitle').innerText = thread.title;
    
    const timeline = document.getElementById('chatTimeline');
    timeline.innerHTML = '';
    
    if (thread.messages.length === 0) {
        timeline.innerHTML = '<div style="color:#666; text-align:center; margin-top:20px;">💡 ゲームの要望を入力してください。自作パサーで解説を表示しつつ画面右側にゲームを生成します。</div>';
    } else {
        thread.messages.forEach(msg => {
            appendMessageToTimeline(msg.role, msg.content);
        });
    }

    const iframe = document.getElementById('gameIframe');
    const status = document.getElementById('gameStatus');
    if (thread.lastGameCode) {
        iframe.srcdoc = thread.lastGameCode;
        status.innerHTML = '<span>● 稼働中</span>';
    } else {
        iframe.srcdoc = '';
        status.innerText = 'ゲーム未生成';
    }
}

function appendMessageToTimeline(role, content) {
    const timeline = document.getElementById('chatTimeline');
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;
    
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    
    if (role === 'assistant') {
        // 自作のパーサ関数を通してHTML化
        bubble.innerHTML = customMarkdownParse(content);
    } else {
        bubble.innerText = content;
    }
    
    msgDiv.appendChild(bubble);
    timeline.appendChild(msgDiv);
    timeline.scrollTop = timeline.scrollHeight;
}

async function processChat() {
    const input = document.getElementById('userInput');
    const sendBtn = document.getElementById('sendBtn');
    const userText = input.value.trim();
    
    if (!userText) return;

    input.value = '';
    sendBtn.disabled = true;

    const thread = threads.find(t => t.id === currentThreadId);
    if (thread.messages.length === 0) {
        thread.title = userText.substring(0, 15) + (userText.length > 15 ? '...' : '');
        document.getElementById('chatTitle').innerText = thread.title;
    }
    
    thread.messages.push({ role: 'user', content: userText });
    appendMessageToTimeline('user', userText);
    saveData();
    renderHistory();

    try {
        const conversationHistory = thread.messages.map(m => `${m.role === 'user' ? 'ユーザー' : 'アシスタント'}: ${m.content}`).join('\n');

        const response = await puter.ai.chat(
            `これまでの会話履歴:\n${conversationHistory}\n\n上記の要望と文脈に合わせて、新しいゲーム、もしくは修正されたゲームを構築してください。`,
            {
                systemPrompt: `あなたは天才ゲーム開発AIです。ユーザーの要望に合わせて次の2つの要素を必ず同時に返してください。

1. 【ゲームの解説や進捗説明（マークダウン形式）】
2. 【ゲームを実行するための完全なHTML生コード】

出力フォーマットのルール：
・HTMLコードのブロックは、必ず「\`\`\`html」と「\`\`\`」のマークダウンコードブロックで囲んで出力してください。
・コードブロックの外側には、実装した機能や操作方法などをユーザー向けの分かりやすいマークダウンテキストで自由に書いてください。必ず「### 見出し」や「- 箇条書き」を使って構造化してください。
・HTMLコードは単一ファイルで完結し、CSS、JavaScriptをすべて内包させ、バグなく即座に動く仕様にしてください。`
            }
        );

        const aiReply = response.text;

        // コードブロックの抽出
        let gameCode = "";
        const codeBlockMatch = aiReply.match(/```html([\s\S]*?)```/);
        if (codeBlockMatch && codeBlockMatch[1]) {
            gameCode = codeBlockMatch[1].trim();
        }

        thread.messages.push({ role: 'assistant', content: aiReply });
        appendMessageToTimeline('assistant', aiReply);

        if (gameCode) {
            thread.lastGameCode = gameCode;
            document.getElementById('gameIframe').srcdoc = gameCode;
            document.getElementById('gameStatus').innerHTML = '<span>● 稼働中 (更新完了)</span>';
        }

        saveData();

    } catch (error) {
        console.error(error);
        appendMessageToTimeline('assistant', `⚠️ エラーが発生しました: ${error.message}`);
    } finally {
        sendBtn.disabled = false;
    }
}

function saveData() {
    localStorage.setItem('game_creator_threads', JSON.stringify(threads));
}

/**
 * 🛠️ 自作のコピー機能（グローバル関数）
 */
window.copyToClipboard = function(button) {
    // ボタンの親要素である .code-container を取得し、その中の code タグのテキストを抽出
    const container = button.closest('.code-container');
    const codeText = container.querySelector('code').innerText;

    navigator.clipboard.writeText(codeText).then(() => {
        button.innerText = 'Copied!';
        button.style.backgroundColor = '#28a745';
        setTimeout(() => {
            button.innerText = 'Copy';
            button.style.backgroundColor = '#444';
        }, 2000);
    }).catch(err => {
        console.error('コピーに失敗しました: ', err);
    });
};

/**
 * 🛠️ 自作の簡易マークダウンパーサー関数（コピーボタン＆バッククォート対策強化版）
 */
function customMarkdownParse(text) {
    let html = text;

    // 特殊文字のプレースホルダー退避処理（競合防止）
    // AIが「```html」や「```javascript」などと出力した場合もすべて網羅して置換
    html = html.replace(/```[a-zA-Z0-9]*([\s\S]*?)```/g, function(match, codeContent) {
        // HTMLエスケープ処理（コード内の < や > がブラウザのタグとしてバグるのを防ぐ）
        const escapedCode = codeContent
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
            
        // コピーボタン付きのコンテナ構造を自作
        return `
            <div class="code-container" style="position: relative; margin: 10px 0;">
                <button onclick="copyToClipboard(this)" style="position: absolute; right: 10px; top: 10px; padding: 4px 8px; font-size: 0.75rem; background: #444; color: #fff; border: 1px solid #555; border-radius: 4px; cursor: pointer; z-index: 10;">Copy</button>
                <pre><code style="display:block; padding-top:25px;">${escapedCode}</code></pre>
            </div>
        `;
    });

    // 2. 見出しの処理 (### 見出し)
    html = html.replace(/^###\s+(.+)$/gm, '===H3_START===$1===H3_END===');
    html = html.replace(/^##\s+(.+)$/gm, '===H3_START===$1===H3_END===');
    html = html.replace(/^#\s+(.+)$/gm, '===H3_START===$1===H3_END===');

    // 3. インラインコード (`code`) の処理
    html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

    // 4. 太字 (**bold**) の処理
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // 5. 箇条書き (- リスト や * リスト) の処理
    html = html.replace(/^[-\*]\s+(.+)$/gm, '<li>$1</li>');
    html = html.replace(/((?:<li>.+?<\/li>\s*)+)/g, '<ul>$1</ul>');

    // 見出しのプレースホルダーを正式なタグに変換
    html = html.split('===H3_START===').join('<h3>');
    html = html.split('===H3_END===').join('</h3>');

    // 6. 段落(<p>)の自動付与ロジック
    const lines = html.split('\n');
    const processedLines = lines.map(line => {
        const trimmed = line.trim();
        if (!trimmed) return '';
        // すでにHTML要素（自作したcode-containerやタグ）に包まれている行はスルー
        if (/^<\/?(div|pre|code|h3|ul|ol|li|button)/.test(trimmed)) {
            return line;
        }
        return `<p>${line}</p>`;
    });

    return processedLines.join('\n');
}
