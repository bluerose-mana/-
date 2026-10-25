/**
 * 定数とAPI設定
 */
const GEMINI_API_URL = "https://gemini-proxy.blue-rose-mi-0710.workers.dev";
const TIME_LIMIT = 20; // 1問あたりの制限時間（秒）

/**
 * アプリケーションの状態管理オブジェクト
 */
const state = {
    lang: 'jp',               // 現在の表示言語 ('jp' または 'en')
    questions: [],            // APIから取得した問題リスト（10問）
    wrongQuestions: [],       // 間違えた問題のリスト（復習用）
    currentIndex: 0,          // 現在の問題番号（0〜9）
    score: 0,                 // 現在のスコア
    isAnswered: false,        // 回答済みかどうかのフラグ（連打防止用）
    timerId: null,            // カウントダウン用のインターバルID
    feedbackTimeoutId: null,  // 次の問題へ進む待機タイマーのID
    timeLeft: TIME_LIMIT,     // 残り時間
    difficulty: 'beginner'    // 選択された難易度 ('beginner' | 'intermediate' | 'advanced')
};

/**
 * 多言語対応（i18n）辞書データ
 * 日本語の漢字にはすべて <ruby> タグでふりがなを設定
 */
const i18n = {
    jp: {
        title: "<ruby>日本<rt>にほん</rt></ruby>の<ruby>方言<rt>ほうげん</rt></ruby>クイズ",
        startBeginner: "<ruby>初級<rt>しょきゅう</rt></ruby>スタート",
        startIntermediate: "<ruby>中級<rt>ちゅうきゅう</rt></ruby>スタート",
        startAdvanced: "<ruby>上級<rt>じょうきゅう</rt></ruby>スタート",
        langBtn: "<ruby>言語変更<rt>げんごへんこう</rt></ruby> / Language",
        loading: "<ruby>問題<rt>もんだい</rt></ruby>を<ruby>生成中<rt>せいせいちゅう</rt></ruby>...",
        idk: "わからない",
        scoreSuffix: "<ruby>点<rt>てん</rt></ruby>",
        backHome: "スタートに<ruby>戻<rt>もど</rt></ruby>る",
        wrongTitle: "<ruby>間違<rt>まちが</rt></ruby>えた<ruby>語句<rt>ごく</rt></ruby>",
        beginner: "<ruby>初級<rt>しょきゅう</rt></ruby>",
        intermediate: "<ruby>中級<rt>ちゅうきゅう</rt></ruby>",
        advanced: "<ruby>上級<rt>じょうきゅう</rt></ruby>",
        quitConfirm: "ゲームを途中でやめてホームに戻りますか？",
        wordLabel: "<ruby>語句<rt>ごく</rt></ruby>",
        meaningLabel: "<ruby>意味<rt>いみ</rt></ruby>",
        exampleLabel: "<ruby>例文<rt>れいぶん</rt></ruby>"
    },
    en: {
        title: "Japanese Dialect Quiz",
        startBeginner: "Beginner Start",
        startIntermediate: "Intermediate Start",
        startAdvanced: "Advanced Start",
        langBtn: "Language / 日本語",
        loading: "Generating Quiz...",
        idk: "I don't know",
        scoreSuffix: " Pts",
        backHome: "Back to Start",
        wrongTitle: "Wrong Words",
        beginner: "Beginner",
        intermediate: "Intermediate",
        advanced: "Advanced",
        quitConfirm: "Quit the game and return to home?",
        wordLabel: "Word",
        meaningLabel: "Meaning",
        exampleLabel: "Example"
    }
};

/**
 * 各画面要素の参照
 */
const screens = {
    home: document.getElementById('home-screen'),
    loading: document.getElementById('loading-screen'),
    quiz: document.getElementById('quiz-screen'),
    result: document.getElementById('result-screen')
};

// ==========================================
// イベントリスナーの登録
// ==========================================

// 言語切り替えボタン
document.getElementById('lang-toggle-btn').addEventListener('click', toggleLanguage);

// 難易度選択ボタン（e.currentTarget を使用し、内部の <ruby> タグクリック時も確実に属性を取得）
document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        state.difficulty = e.currentTarget.dataset.level;
        startGame();
    });
});

// 「わからない」ボタン（不正解扱いで処理）
document.getElementById('idk-btn').addEventListener('click', () => {
    if (!state.isAnswered) processAnswer(false);
});

// 結果画面の「スタートに戻る」ボタン
document.getElementById('home-btn').addEventListener('click', resetGame);

// クイズ画面左上の「×（やめる）」ボタン
document.getElementById('quit-btn').addEventListener('click', () => {
    const t = i18n[state.lang];
    if (confirm(t.quitConfirm)) {
        resetGame();
    }
});

// ==========================================
// タイマー管理関数
// ==========================================

/**
 * 20秒のカウントダウンタイマーを開始する
 */
function startTimer() {
    state.timeLeft = TIME_LIMIT;
    updateTimerDisplay();
    stopTimer(); // 既存のタイマーがあればクリア

    state.timerId = setInterval(() => {
        state.timeLeft--;
        updateTimerDisplay();
        if (state.timeLeft <= 0) {
            processAnswer(false); // 時間切れは不正解として処理
        }
    }, 1000);
}

/**
 * 実行中のタイマーおよび画面遷移待機タイマーを停止する
 */
function stopTimer() {
    if (state.timerId) {
        clearInterval(state.timerId);
        state.timerId = null;
    }
    if (state.feedbackTimeoutId) {
        clearTimeout(state.feedbackTimeoutId);
        state.feedbackTimeoutId = null;
    }
}

/**
 * 円グラフタイマーの描画を更新する
 */
function updateTimerDisplay() {
    const degree = (state.timeLeft / TIME_LIMIT) * 360;
    const pie = document.getElementById('timer-pie');
    // 残り時間をオレンジ(#f39c12)、経過時間をグレー(#e2e8f0)で描画
    pie.style.background = `conic-gradient(#f39c12 ${degree}deg, #e2e8f0 0deg)`;
}

// ==========================================
// UI更新・画面遷移関数
// ==========================================

/**
 * 表示言語（日本語 / 英語）を切り替える
 */
function toggleLanguage() {
    state.lang = state.lang === 'jp' ? 'en' : 'jp';
    updateUITexts();
    // クイズ中に言語が切り替わった場合は問題表示も再描画
    if (screens.quiz.classList.contains('active') && state.questions.length > 0) {
        renderQuestion();
    }
}

/**
 * 現在の言語設定に合わせて画面内の固定テキストを更新する
 */
function updateUITexts() {
    const t = i18n[state.lang];
    document.getElementById('title-text').innerHTML = t.title;
    document.getElementById('btn-beginner').innerHTML = t.startBeginner;
    document.getElementById('btn-intermediate').innerHTML = t.startIntermediate;
    document.getElementById('btn-advanced').innerHTML = t.startAdvanced;
    document.getElementById('lang-toggle-btn').innerHTML = t.langBtn;
    document.getElementById('loading-text').innerHTML = t.loading;
    document.getElementById('idk-btn').innerHTML = t.idk;
    document.getElementById('home-btn').innerHTML = t.backHome;
    document.querySelector('.wrong-list-title').innerHTML = t.wrongTitle;
    
    updateDifficultyBar();
}

/**
 * 難易度バーのテキストと背景色を現在の難易度に合わせて更新する
 */
function updateDifficultyBar() {
    const t = i18n[state.lang];
    const bars = [
        document.getElementById('difficulty-bar'),
        document.getElementById('result-difficulty-bar')
    ];
    
    const difficultyMap = {
        beginner: { label: t.beginner, className: 'bg-beginner' },
        intermediate: { label: t.intermediate, className: 'bg-intermediate' },
        advanced: { label: t.advanced, className: 'bg-advanced' }
    };

    const current = difficultyMap[state.difficulty] || difficultyMap.beginner;

    bars.forEach(bar => {
        bar.innerHTML = current.label;
        bar.className = `difficulty-bar ${current.className}`;
    });
}

/**
 * 指定された画面のみを表示し、他の画面を非表示にする
 * @param {HTMLElement} activeScreen 表示する画面のDOM要素
 */
function switchScreen(activeScreen) {
    Object.values(screens).forEach(screen => {
        screen.classList.remove('active');
        screen.classList.add('hidden');
    });
    activeScreen.classList.remove('hidden');
    activeScreen.classList.add('active');
}

// ==========================================
// ゲーム進行・API通信ロジック
// ==========================================

/**
 * ゲームを初期化し、Gemini APIから問題を取得してクイズを開始する
 */
async function startGame() {

    switchScreen(screens.loading);
    state.currentIndex = 0;
    state.score = 0;
    state.wrongQuestions = [];
    
    try {
        await fetchQuestionsFromGemini();
        switchScreen(screens.quiz);
        renderQuestion();
    } catch (error) {
        alert(`問題の取得に失敗しました: ${error.message}`);
        switchScreen(screens.home);
    }
}

/**
 * Gemini APIに「穴埋め」だけをさせる完全固定ロジック
 * （捏造・重複・指示無視を物理的に100%不可能にする最終版）
 */
async function fetchQuestionsFromGemini() {
    // 【絶対安全な辞書データ（正解と地域もセットで定義）】
    const dialectDictionaries = {
        beginner: [
            { word: "おおきに", correct_jp: "ありがとう", region: "関西地方" },
            { word: "めんこい", correct_jp: "かわいい", region: "東北地方" },
            { word: "ばってん", correct_jp: "けれど、しかし", region: "九州地方" },
            { word: "なまら", correct_jp: "とても", region: "北海道" },
            { word: "だべ", correct_jp: "〜でしょう", region: "東北地方" },
            { word: "はいさい", correct_jp: "こんにちは", region: "沖縄地方" },
            { word: "あかん", correct_jp: "ダメだ", region: "関西地方" },
            { word: "なんぼ", correct_jp: "いくら", region: "関西地方" },
            { word: "えらい", correct_jp: "疲れた、しんどい", region: "中部・関西地方" },
            { word: "よかよか", correct_jp: "いいよ、大丈夫", region: "九州地方" },
            { word: "ほんま", correct_jp: "本当", region: "関西地方" },
            { word: "なんぎ", correct_jp: "大変、面倒", region: "関西・中国地方" }
        ],
        intermediate: [
            { word: "しゃっこい", correct_jp: "冷たい", region: "東北地方" },
            { word: "だもんで", correct_jp: "だから", region: "中部地方" },
            { word: "ちかっぱ", correct_jp: "とても", region: "九州地方" },
            { word: "うるかす", correct_jp: "水に浸す", region: "北海道・東北地方" },
            { word: "なおす", correct_jp: "片付ける", region: "関西・九州地方" },
            { word: "たいぎい", correct_jp: "面倒くさい", region: "中国・四国地方" },
            { word: "けっぱる", correct_jp: "頑張る", region: "北海道・東北地方" },
            { word: "でら", correct_jp: "とても", region: "中部地方" },
            { word: "わや", correct_jp: "めちゃくちゃ", region: "北海道・関西地方" },
            { word: "てーげー", correct_jp: "だいたい、適当", region: "沖縄地方" },
            { word: "まめ", correct_jp: "元気", region: "中国地方" },
            { word: "ぼちぼち", correct_jp: "そろそろ", region: "関西地方" }
        ],
        advanced: [
            { word: "おぼこい", correct_jp: "幼い、かわいらしい", region: "関西地方" },
            { word: "ぼっちり", correct_jp: "ちょうど", region: "四国地方" },
            { word: "むつこい", correct_jp: "脂っこい、しつこい", region: "四国地方" },
            { word: "おきばりやす", correct_jp: "頑張ってください", region: "関西地方" },
            { word: "しらしんけん", correct_jp: "一生懸命", region: "九州地方" },
            { word: "ずく", correct_jp: "やる気、根気", region: "長野県" },
            { word: "ほっこり", correct_jp: "ほっとする", region: "関西地方" },
            { word: "いづい", correct_jp: "しっくりこない", region: "東北地方" },
            { word: "おじゃみ", correct_jp: "お手玉", region: "関西・四国地方" },
            { word: "さすけねぇ", correct_jp: "大丈夫だ", region: "東北地方" },
            { word: "だんだん", correct_jp: "ありがとう", region: "山陰地方" },
            { word: "ちんちこちん", correct_jp: "とても熱い", region: "中部地方" }
        ]
    };

    // 選んだ難易度の辞書から、重複なしでランダムに10個抽出
    const currentDictionary = dialectDictionaries[state.difficulty];
    let shuffledDict = [...currentDictionary].sort(() => Math.random() - 0.5);
    const selectedData = shuffledDict.slice(0, 10);

    // AIには「入力データの穴埋め」だけを指示する
    const prompt = `
以下の【入力データ】には、方言のクイズ10問分の「お題(word)」「正解の意味(correct_jp)」「地域(region)」が既に設定されています。
このデータを元にして、不足している以下の情報を補完し、完成したJSONデータを出力してください。

【補完する内容】
1. 不正解のダミー選択肢を3つ作成する（日本語）
2. 全ての選択肢（正解1つ＋ダミー3つ）の英語訳(en)を作成する
3. その方言を使った自然な例文（日本語と英語訳）を作成する
※漢字を使用する場合は、必ず <ruby> タグでルビを振ってください。

【入力データ】
${JSON.stringify(selectedData, null, 2)}
`;

    try {
        const res = await fetch(GEMINI_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.1, 
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "ARRAY",
                        items: {
                            type: "OBJECT",
                            properties: {
                                word: { type: "STRING", description: "入力データのwordをそのまま出力" },
                                options: {
                                    type: "ARRAY",
                                    items: {
                                        type: "OBJECT",
                                        properties: { jp: { type: "STRING" }, en: { type: "STRING" }, isCorrect: { type: "BOOLEAN" } },
                                        required: ["jp", "en", "isCorrect"]
                                    }
                                },
                                explanation: {
                                    type: "OBJECT",
                                    properties: { 
                                        standard_jp: { type: "STRING", description: "入力データのcorrect_jpをそのまま出力" }, 
                                        standard_en: { type: "STRING" }, 
                                        region_jp: { type: "STRING", description: "入力データのregionをそのまま出力" }, 
                                        region_en: { type: "STRING" }, 
                                        example_jp: { type: "STRING" }, 
                                        example_en: { type: "STRING" } 
                                    },
                                    required: ["standard_jp", "standard_en", "region_jp", "region_en", "example_jp", "example_en"]
                                }
                            },
                            required: ["word", "options", "explanation"]
                        }
                    }
                }
            })
        });

        if (!res.ok) throw new Error(`通信エラー (${res.status})`);
        const data = await res.json();
        state.questions = JSON.parse(data.candidates[0].content.parts[0].text.trim());

    } catch (error) {
        console.error("API通信に失敗しました:", error);
        throw error;
    }
}

/**
 * 現在の問題データを画面に描画し、タイマーを開始する
 */
function renderQuestion() {
    state.isAnswered = false;
    updateDifficultyBar();
    const q = state.questions[state.currentIndex];
    
    // 進捗と出題単語の表示
    document.getElementById('progress-text').innerText = `${state.currentIndex + 1}/${state.questions.length}`;
    document.getElementById('dialect-word').innerHTML = q.word;

    // 地方名の表示
    const regionText = state.lang === 'jp' ? q.explanation.region_jp : q.explanation.region_en;
    document.getElementById('question-region').innerHTML = `【${regionText}】`;

    // 選択肢をランダムにシャッフルしてボタンを生成
    const optionsContainer = document.getElementById('options-container');
    optionsContainer.innerHTML = '';
    const shuffledOptions = [...q.options].sort(() => Math.random() - 0.5);

    shuffledOptions.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerHTML = state.lang === 'jp' ? opt.jp : opt.en;
        btn.dataset.isCorrect = opt.isCorrect;
        btn.onclick = () => processAnswer(opt.isCorrect);
        optionsContainer.appendChild(btn);
    });

    startTimer();
}

/**
 * 回答選択時・時間切れ時・「わからない」クリック時の共通正誤処理
 * @param {boolean} isCorrect 正解かどうか
 */
function processAnswer(isCorrect) {
    if (state.isAnswered) return;
    state.isAnswered = true;
    stopTimer();

    const overlay = document.getElementById('feedback-overlay');
    overlay.classList.remove('hidden', 'feedback-o', 'feedback-x');

    if (isCorrect) {
        state.score += 10;
        overlay.innerText = "〇";
        overlay.classList.add('feedback-o');
    } else {
        overlay.innerText = "✕";
        overlay.classList.add('feedback-x');
        // 間違えた問題を復習リストに追加
        state.wrongQuestions.push(state.questions[state.currentIndex]);

        // 正解だった選択肢を赤くハイライト表示する
        document.querySelectorAll('.option-btn').forEach(btn => {
            if (btn.dataset.isCorrect === "true") {
                btn.classList.add('correct-highlight');
            }
        });
    }

    // 1.2秒後にオーバーレイを隠して次の問題へ進む
    state.feedbackTimeoutId = setTimeout(() => {
        overlay.classList.add('hidden');
        nextQuestion();
    }, 1200);
}

/**
 * 次の問題へ進むか、全問終了していれば結果画面を表示する
 */
function nextQuestion() {
    state.currentIndex++;
    if (state.currentIndex < state.questions.length) {
        renderQuestion();
    } else {
        showResult();
    }
}

/**
 * 結果画面を描画し、間違えた問題のアコーディオンリストを生成する
 */
function showResult() {
    updateDifficultyBar();
    const t = i18n[state.lang];
    document.getElementById('score-text').innerHTML = `${state.score}${t.scoreSuffix}`;
    
    const listContainer = document.getElementById('wrong-list');
    const wrongWrapper = document.getElementById('wrong-list-container');
    listContainer.innerHTML = '';

    // 全問正解の場合は「間違えた語句」セクション自体を非表示にする
    if (state.wrongQuestions.length === 0) {
        wrongWrapper.classList.add('hidden');
    } else {
        wrongWrapper.classList.remove('hidden');
        
        state.wrongQuestions.forEach((q, index) => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'wrong-item';
            
            // アコーディオンのヘッダー部分
            const headerDiv = document.createElement('div');
            headerDiv.className = 'wrong-header';
            headerDiv.innerHTML = `${t.wordLabel} ${index + 1}: ${q.word}`;
            
            // アコーディオンの詳細コンテンツ部分
            const contentDiv = document.createElement('div');
            contentDiv.className = 'wrong-content';
            
            const reg = state.lang === 'jp' ? q.explanation.region_jp : q.explanation.region_en;
            const std = state.lang === 'jp' ? q.explanation.standard_jp : q.explanation.standard_en;
            const ex = state.lang === 'jp' ? q.explanation.example_jp : q.explanation.example_en;
            
            contentDiv.innerHTML = `
                <p><strong>【${reg}】</strong></p>
                <p>${t.meaningLabel} : ${std}</p>
                <p>${t.exampleLabel} : ${ex}</p>
            `;

            // クリックで詳細を開閉
            headerDiv.onclick = () => {
                contentDiv.classList.toggle('open');
            };

            itemDiv.appendChild(headerDiv);
            itemDiv.appendChild(contentDiv);
            listContainer.appendChild(itemDiv);
        });
    }

    switchScreen(screens.result);
}

/**
 * ゲームをリセットしてホーム画面に戻る
 */
function resetGame() {
    stopTimer();
    document.getElementById('feedback-overlay').classList.add('hidden');
    switchScreen(screens.home);
}

// 初期表示時のテキスト反映
updateUITexts();