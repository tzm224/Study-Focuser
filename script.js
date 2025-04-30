// Core Timer Logic for Study Focus App

// Durations in seconds
const FOCUS_DURATION = 90 * 60;
const LONG_BREAK_DURATION = 20 * 60;
const SHORT_BREAK_DURATION = 10;
const RANDOM_PROMPT_MIN_INTERVAL = 5 * 60; // 5 minutes
const RANDOM_PROMPT_MAX_INTERVAL = 10 * 60; // 10 minutes

// State variables
let currentPhase = 'focus'; // 'focus', 'long_break', 'short_break'
let remainingTime = FOCUS_DURATION;
let mainTimerInterval = null;
let isPaused = true;
let randomPromptTimeout = null;
let focusTimeBeforeShortBreak = null; // To store remaining focus time when interrupted
let completedCycles = 0; // Reward system: Counter for completed focus+long_break cycles
let totalFocusTimeToday = 0; // Focus tracking: Accumulator for today's focus time in seconds
let todayDateString = new Date().toLocaleDateString(); // Focus tracking: Store today's date
let audioUnlocked = false; // Flag to track if user interaction has occurred for audio
let initialUserInteraction = false; // Flag for first user interaction

// DOM Elements (will be assigned in initializeApp)
let timerDisplay = null;
let phaseDisplay = null;
let startButton = null;
let pauseButton = null;
let resetButton = null;
let cyclesDisplay = null; // Reward system: Element to display completed cycles
let totalFocusDisplay = null; // Focus tracking: Element to display today's total focus time
let previewSoundButton = null; // Sound preview button
let statusMessageElement = null; // For displaying messages to the user

// Audio Elements (will be assigned in initializeApp)
let allAudioElements = [];
let focusStartSound = null;
let longBreakStartSound = null;
let shortBreakPromptSound = null;
let phaseEndSound = null;
let rewardSound = null; // Reward system: Sound for completing a cycle

// --- Local Storage Keys ---
const STORAGE_KEY_CYCLES = 'studyTimerCycles';
const STORAGE_KEY_FOCUS_TIME = 'studyTimerFocusTime';
const STORAGE_KEY_DATE = 'studyTimerDate';

// --- Audio Handling ---

// Function to attempt unlocking audio context after user interaction
function unlockAudioContext() {
    if (audioUnlocked) return;
    console.log("[Audio Debug] Attempting to unlock audio context...");
    // Use a more robust check for AudioContext availability
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
        console.error("[Audio Debug] Web Audio API not supported.");
        setStatusMessage("错误：浏览器不支持音频播放所需功能。", true);
        return;
    }
    const audioCtx = new AudioContext();

    // Create a dummy buffer source
    const buffer = audioCtx.createBuffer(1, 1, 22050);
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);

    // Play the dummy source - this often unlocks the context on user interaction
    if (typeof source.start === 'function') {
        source.start(0);
    }

    // Check the state - it might be 'running' immediately or after a short delay
    if (audioCtx.state === 'suspended') {
        audioCtx.resume().then(() => {
            audioUnlocked = true;
            console.log("[Audio Debug] AudioContext resumed and unlocked.");
            setStatusMessage("音频已启用。");
            // Try loading HTML5 audio elements again after context is unlocked
            preloadHtml5Audio();
        }).catch(err => {
            console.error("[Audio Debug] Error resuming AudioContext:", err);
            setStatusMessage("无法自动启用音频，请尝试再次点击按钮。", true);
        });
    } else if (audioCtx.state === 'running') {
        audioUnlocked = true;
        console.log("[Audio Debug] AudioContext is running and unlocked.");
        setStatusMessage("音频已启用。");
        preloadHtml5Audio();
    } else {
        console.warn("[Audio Debug] AudioContext state unknown or closed:", audioCtx.state);
        setStatusMessage("无法启用音频，状态未知。", true);
    }
}

// Function to preload HTML5 audio elements (call after audio context is unlocked)
function preloadHtml5Audio() {
    console.log("[Audio Debug] Preloading HTML5 audio elements...");
    allAudioElements.forEach(audio => {
        if (audio && typeof audio.load === 'function') {
            try {
                audio.load();
                console.log(`[Audio Debug] Loading ${audio.id}`);
            } catch (e) {
                console.error(`[Audio Debug] Error loading ${audio.id}:`, e);
            }
        }
    });
}

// Updated sound playback function with more logging
function playSound(soundElement, context = 'Unknown') {
    console.log(`[Audio Debug] Attempting to play sound: ${soundElement ? soundElement.id : 'null'} from context: ${context}`);
    if (!audioUnlocked) {
        console.warn("[Audio Debug] Audio not unlocked yet. Skipping playback.");
        setStatusMessage("请先点击任意按钮以启用声音。", true);
        return;
    }
    if (soundElement && typeof soundElement.play === 'function') {
        soundElement.load(); // Ensure latest state is loaded before playing
        soundElement.currentTime = 0; // Rewind to start
        let playPromise = soundElement.play();

        if (playPromise !== undefined) {
            playPromise.then(_ => {
                // Playback started successfully
                console.log(`[Audio Debug] Playback started for ${soundElement.id} from ${context}.`);
            })
            .catch(error => {
                console.error(`[Audio Debug] Error playing sound (${soundElement.id} from ${context}):`, error);
                if (error.name === 'NotAllowedError') {
                    console.warn("[Audio Debug] Playback failed (NotAllowedError). Browser might require more interaction or permissions.");
                    setStatusMessage("浏览器阻止了声音播放，请再次交互。", true);
                    // Consider resetting audioUnlocked here if needed, forcing another unlock attempt
                    // audioUnlocked = false;
                } else if (error.name === 'AbortError') {
                    console.warn(`[Audio Debug] Playback aborted for ${soundElement.id} (likely intentional).`);
                } else {
                    setStatusMessage(`播放声音时出错: ${error.name}`, true);
                }
            });
        } else {
             console.warn(`[Audio Debug] play() did not return a promise for ${soundElement.id}. Playback might be unreliable.`);
             // Fallback for older browsers or unexpected behavior
             try {
                 soundElement.play();
             } catch (error) {
                  console.error(`[Audio Debug] Fallback play() error for ${soundElement.id}:`, error);
                  setStatusMessage(`播放声音时出错: ${error.name}`, true);
             }
        }
    } else {
        console.warn(`[Audio Debug] Sound element not found or not playable: ${soundElement ? soundElement.id : 'undefined'} from context: ${context}`);
        setStatusMessage("无法找到或播放指定的声音文件。", true);
    }
}

// --- Timer Control Functions ---

function handleUserInteraction() {
    if (!initialUserInteraction) {
        initialUserInteraction = true;
        console.log("[Audio Debug] First user interaction detected.");
        unlockAudioContext();
    }
}

function startMainTimer() {
    handleUserInteraction(); // Ensure audio is unlocked on first start
    if (!isPaused) return; // Already running
    isPaused = false;
    console.log(`[Timer] Started/Resumed - Phase: ${currentPhase}`);
    setStatusMessage("专注计时开始...");
    updateButtonStates();
    clearInterval(mainTimerInterval);
    mainTimerInterval = setInterval(tick, 1000);

    // Ensure random prompt timer starts/restarts correctly
    stopRandomPromptTimer(); // Clear any existing timer first
    if (currentPhase === 'focus') {
        startRandomPromptTimer();
    }
}

function pauseMainTimer() {
    if (isPaused) return; // Already paused
    isPaused = true;
    clearInterval(mainTimerInterval);
    mainTimerInterval = null;
    stopRandomPromptTimer(); // Pause random prompt when main timer pauses
    console.log(`[Timer] Paused - Phase: ${currentPhase}`);
    setStatusMessage("计时已暂停。");
    updateButtonStates();
}

function resetMainTimer() {
    handleUserInteraction(); // Ensure audio is unlocked
    console.log("[Timer] Reset");
    pauseMainTimer(); // Stop the timer and random prompt
    currentPhase = 'focus';
    remainingTime = FOCUS_DURATION;
    focusTimeBeforeShortBreak = null;
    isPaused = true;
    setStatusMessage("计时器已重置。");
    updateDisplay(); // Update UI to show reset state
    updateButtonStates();
}

// --- Timer Tick and Phase Switching ---

function tick() {
    if (isPaused) return;

    if (remainingTime > 0) {
        remainingTime--;
        // Track focus time only during the focus phase
        if (currentPhase === 'focus') {
            totalFocusTimeToday++;
            // Save less frequently to reduce localStorage writes (e.g., every 10 seconds)
            if (remainingTime % 10 === 0) {
                 saveFocusTime();
                 updateTotalFocusDisplay();
            }
        }
        updateDisplay();
    } else {
        handlePhaseEnd();
    }
}

function handlePhaseEnd() {
    console.log(`[Timer] Phase Ended: ${currentPhase}`);

    if (currentPhase === 'focus') {
        playSound(phaseEndSound, 'Focus End');
        stopRandomPromptTimer(); // Stop random prompts during long break
        startLongBreak();
    } else if (currentPhase === 'long_break') {
        // Completed a full focus + long break cycle
        completedCycles++;
        saveCompletedCycles(); // Save cycles to localStorage
        console.log(`[Timer] Cycle Completed! Total cycles: ${completedCycles}`);
        playSound(rewardSound, 'Cycle Reward');
        updateRewardDisplay(); // Update UI for reward
        startFocusSession(); // Start new focus session after long break
    } else if (currentPhase === 'short_break') {
        // Short break ends, resume focus session
        console.log("[Timer] Short break finished.");
        // Play sound for resuming focus
        playSound(focusStartSound, 'Resume Focus after Short Break');
        resumeFocusAfterShortBreak();
    }
}

function startFocusSession() {
    currentPhase = 'focus';
    remainingTime = FOCUS_DURATION;
    focusTimeBeforeShortBreak = null; // Reset stored time
    console.log("[Timer] Starting Focus Session (90 mins)");
    setStatusMessage("进入专注阶段...");
    playSound(focusStartSound, 'Focus Start');
    updateDisplay();
    // Ensure random prompt timer starts/restarts correctly
    stopRandomPromptTimer(); // Clear any existing timer first
    if (!isPaused) {
        startRandomPromptTimer();
    }
}

function startLongBreak() {
    currentPhase = 'long_break';
    remainingTime = LONG_BREAK_DURATION;
    stopRandomPromptTimer(); // Ensure random prompt is stopped
    console.log("[Timer] Starting Long Break (20 mins)");
    setStatusMessage("进入长休息阶段...");
    playSound(longBreakStartSound, 'Long Break Start');
    updateDisplay();
}

function startShortBreak() {
    // Play sound at the START of the short break
    playSound(shortBreakPromptSound, 'Short Break Start');
    currentPhase = 'short_break';
    remainingTime = SHORT_BREAK_DURATION;
    console.log("[Timer] Starting Short Break (10 secs)");
    setStatusMessage("进入短休息 (10秒)...");
    updateDisplay();
    // Main timer interval continues running the countdown
}

function resumeFocusAfterShortBreak() {
    currentPhase = 'focus';
    remainingTime = focusTimeBeforeShortBreak; // Restore focus time
    focusTimeBeforeShortBreak = null;
    console.log("[Timer] Resuming Focus Session after Short Break");
    setStatusMessage("恢复专注阶段...");
    // Sound played in handlePhaseEnd before calling this
    updateDisplay();
    // Ensure random prompt timer starts/restarts correctly
    stopRandomPromptTimer(); // Clear any existing timer first
    if (!isPaused) {
        startRandomPromptTimer();
    }
}

// --- Random Prompt Timer Logic (Improved) ---

function getRandomInterval() {
    // Ensure calculation is floating point before multiplying by 1000
    const randomFraction = Math.random();
    const intervalSeconds = RANDOM_PROMPT_MIN_INTERVAL + randomFraction * (RANDOM_PROMPT_MAX_INTERVAL - RANDOM_PROMPT_MIN_INTERVAL);
    const intervalMilliseconds = Math.floor(intervalSeconds * 1000);
    console.log(`[Random Timer] Calculated interval: ${intervalSeconds.toFixed(2)} seconds (${intervalMilliseconds} ms)`);
    return intervalMilliseconds;
}

function startRandomPromptTimer() {
    // Clear any existing timeout just in case
    stopRandomPromptTimer();

    if (isPaused || currentPhase !== 'focus') {
        console.log("[Random Timer] Not starting: Timer paused or not in focus phase.");
        return;
    }

    const interval = getRandomInterval();
    console.log(`[Random Timer] Setting next prompt timeout for ${interval} ms.`);
    randomPromptTimeout = setTimeout(handleRandomPrompt, interval);
}

function stopRandomPromptTimer() {
    if (randomPromptTimeout) {
        clearTimeout(randomPromptTimeout);
        randomPromptTimeout = null;
        console.log("[Random Timer] Cleared existing prompt timeout.");
    }
}

function handleRandomPrompt() {
    console.log("[Random Timer] Prompt Triggered! Starting short break.");
    // Store remaining focus time *before* changing phase/time
    focusTimeBeforeShortBreak = remainingTime;

    // Switch to short break phase (this will play the sound)
    startShortBreak();

    // Important: Do NOT restart the random timer here.
    // It will be restarted automatically when focus resumes in resumeFocusAfterShortBreak().
}

// --- Sound Preview --- 
function previewPromptSound() {
    handleUserInteraction(); // Ensure audio is unlocked
    console.log("[Audio Debug] Previewing prompt sound...");
    playSound(shortBreakPromptSound, 'Preview Button');
}

// --- Display Update & UI Interaction ---

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatTotalTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}小时 ${minutes}分钟`;
}

function setStatusMessage(message, isError = false) {
    if (statusMessageElement) {
        statusMessageElement.textContent = message;
        statusMessageElement.style.color = isError ? '#c0392b' : '#7f8c8d'; // Red for errors
        console.log(`[Status Update] ${message}`);
    }
}

function updateDisplay() {
    const phaseText = currentPhase.replace('_', ' ').toUpperCase();
    const timeText = formatTime(remainingTime);
    // console.log(`UI Update -> Phase: ${phaseText}, Time: ${timeText}`); // Reduce console noise
    if (timerDisplay) {
        timerDisplay.textContent = timeText;
    }
    if (phaseDisplay) {
        phaseDisplay.textContent = phaseText;
        document.body.className = `phase-${currentPhase}`;
    }
}

function updateButtonStates() {
    if (!startButton || !pauseButton || !resetButton) return;
    startButton.disabled = !isPaused;
    pauseButton.disabled = isPaused;
    resetButton.disabled = false; // Reset is always enabled for now
    // Preview button should always be enabled
    if (previewSoundButton) previewSoundButton.disabled = false;
}

// Reward System: Update UI
function updateRewardDisplay() {
    if (cyclesDisplay) {
        cyclesDisplay.textContent = completedCycles;
        // Optional: Add animation or visual feedback for reward
        if (completedCycles > 0 && !document.body.classList.contains('reward-flash-active')) { // Prevent re-triggering animation
            const rewardItem = cyclesDisplay.closest('.stat-item'); // Find parent for flashing
            if (rewardItem) {
                rewardItem.classList.add('reward-flash');
                document.body.classList.add('reward-flash-active'); // Add flag
                setTimeout(() => {
                    rewardItem.classList.remove('reward-flash');
                    document.body.classList.remove('reward-flash-active'); // Remove flag
                }, 1000); // Remove flash effect after 1 second
            }
        }
    }
}

// Focus Tracking: Update UI
function updateTotalFocusDisplay() {
    if (totalFocusDisplay) {
        totalFocusDisplay.textContent = formatTotalTime(totalFocusTimeToday);
    }
}

// --- Local Storage Handling ---

function loadData() {
    const savedDate = localStorage.getItem(STORAGE_KEY_DATE);
    if (savedDate === todayDateString) {
        // Load data from today
        completedCycles = parseInt(localStorage.getItem(STORAGE_KEY_CYCLES) || '0', 10);
        totalFocusTimeToday = parseInt(localStorage.getItem(STORAGE_KEY_FOCUS_TIME) || '0', 10);
        console.log('[Storage] Loaded data from today:', { completedCycles, totalFocusTimeToday });
    } else {
        // It's a new day, reset data
        completedCycles = 0;
        totalFocusTimeToday = 0;
        localStorage.setItem(STORAGE_KEY_DATE, todayDateString);
        localStorage.setItem(STORAGE_KEY_CYCLES, '0');
        localStorage.setItem(STORAGE_KEY_FOCUS_TIME, '0');
        console.log('[Storage] New day detected, data reset.');
    }
}

function saveCompletedCycles() {
    localStorage.setItem(STORAGE_KEY_CYCLES, completedCycles.toString());
}

function saveFocusTime() {
    localStorage.setItem(STORAGE_KEY_FOCUS_TIME, totalFocusTimeToday.toString());
    // Ensure date is also saved/updated if needed (though loadData handles daily reset)
    localStorage.setItem(STORAGE_KEY_DATE, todayDateString);
}

// --- Page Unload Handler ---

function handlePageUnload(event) {
    // Save final data just in case
    saveFocusTime();
    saveCompletedCycles();

    // Display summary message
    const totalTimeFormatted = formatTotalTime(totalFocusTimeToday);
    const message = `今天您已专注 ${totalTimeFormatted}，完成了 ${completedCycles} 个学习周期。确定要离开吗？`;

    // Standard way to show a confirmation dialog on unload
    // Only show the prompt if some focus time was recorded and timer is not paused/reset
    if (totalFocusTimeToday > 0 && !isPaused) {
        try {
             event.preventDefault(); // Required for Chrome
             event.returnValue = message; // Required for older browsers
             console.log("[App] Unload event triggered. Summary:", message);
             return message; // For some older browsers
        } catch (e) {
            console.warn("[App] Error setting unload message:", e);
        }
    } else {
        console.log("[App] Unload event triggered. No focus time recorded or timer paused/reset.");
    }
}

// --- Initial Setup ---

function initializeApp() {
    console.log("[App] Initializing...");

    // Load data from localStorage
    loadData();

    // Select DOM elements
    timerDisplay = document.getElementById('timer-display');
    phaseDisplay = document.getElementById('phase-display');
    startButton = document.getElementById('start-button');
    pauseButton = document.getElementById('pause-button');
    resetButton = document.getElementById('reset-button');
    cyclesDisplay = document.getElementById('cycles-count'); // Reward system
    totalFocusDisplay = document.getElementById('total-focus-time'); // Focus tracking UI
    previewSoundButton = document.getElementById('preview-sound-button'); // Sound preview
    statusMessageElement = document.getElementById('status-message'); // Status message display

    // Select Audio elements
    focusStartSound = document.getElementById('focus-start-sound');
    longBreakStartSound = document.getElementById('long-break-start-sound');
    shortBreakPromptSound = document.getElementById('short-break-prompt-sound');
    phaseEndSound = document.getElementById('phase-end-sound');
    rewardSound = document.getElementById('reward-sound'); // Reward system
    allAudioElements = [focusStartSound, longBreakStartSound, shortBreakPromptSound, phaseEndSound, rewardSound].filter(el => el !== null);

    // Add event listeners for ALL buttons to trigger audio unlock
    if (startButton) startButton.addEventListener('click', handleUserInteraction);
    if (pauseButton) pauseButton.addEventListener('click', handleUserInteraction);
    if (resetButton) resetButton.addEventListener('click', handleUserInteraction);
    if (previewSoundButton) previewSoundButton.addEventListener('click', handleUserInteraction);

    // Add specific function listeners
    if (startButton) startButton.addEventListener('click', startMainTimer);
    if (pauseButton) pauseButton.addEventListener('click', pauseMainTimer);
    if (resetButton) resetButton.addEventListener('click', resetMainTimer);
    if (previewSoundButton) previewSoundButton.addEventListener('click', previewPromptSound);

    // Add listener for page unload
    window.addEventListener('beforeunload', handlePageUnload);

    // Initial state
    updateDisplay();
    updateButtonStates();
    updateRewardDisplay(); // Show initial/loaded cycle count
    updateTotalFocusDisplay(); // Show initial/loaded total focus time
    setStatusMessage("点击任意按钮以启用声音。");

    console.log("[App] Initialized. Waiting for user interaction to unlock audio.");
}

// Run initialization when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', initializeApp);

