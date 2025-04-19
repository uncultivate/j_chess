// Initialize chess board and game
let board = null;
let game = new Chess();
let socket = io();
let latestAnalysisData = null; // Store latest analysis data for toggles (Re-added)
let fenHistory = [game.fen()]; // Initialize with the actual starting FEN from the new game object
let checkSquare = null; // Track the square with the king in check
let currentViewIndex = 0; // Current position being viewed in the FEN history
let isViewingHistory = false; // Flag to indicate if we're in history browsing mode

// Configuration for chessboard.js
const boardConfig = {
    draggable: true,
    position: 'start',
    onDragStart: onDragStart,
    onDrop: onDrop,
    pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png'
};

// Engine settings handling
let settingsTimeout = null;

function initializeEngineSettings() {
    // Get current settings from server
    $.get('/api/engine/settings', function(settings) {
        $('#depthRange').val(settings.depth);
        $('#depthValue').text(settings.depth);
        $('#skillRange').val(settings.skill_level);
        $('#skillValue').text(settings.skill_level);
    });
    
    // Set up event listeners for range inputs
    $('#depthRange').on('input', function() {
        $('#depthValue').text($(this).val());
        scheduleSettingsUpdate();
    });
    
    $('#skillRange').on('input', function() {
        $('#skillValue').text($(this).val());
        scheduleSettingsUpdate();
    });
}

function scheduleSettingsUpdate() {
    // Clear existing timeout
    if (settingsTimeout) {
        clearTimeout(settingsTimeout);
    }
    
    // Schedule new update
    settingsTimeout = setTimeout(updateEngineSettings, 500);
}

function updateEngineSettings() {
    const settings = {
        depth: parseInt($('#depthRange').val()),
        skill_level: parseInt($('#skillRange').val())
    };
    
    $.ajax({
        url: '/api/engine/settings',
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(settings),
        success: function(response) {
            // Trigger a new analysis with updated settings
            if (game) {
                sendMoveToServer(null);
            }
        },
        error: function(xhr) {
            console.error('Failed to update engine settings:', xhr.responseText);
        }
    });
}

// Initialize AI side handling
function initializeAISide() {
    // Get current AI side from server
    $.get('/api/engine/side', function(settings) {
        const side = settings.ai_side || 'none';
        $(`#ai${side.charAt(0).toUpperCase() + side.slice(1)}`).prop('checked', true);
        
        // If AI plays as white, make its first move
        if (side === 'white' && game.turn() === 'w') {
            console.log("Initiating AI's first move"); // Debug log
            setTimeout(() => sendMoveToServer(null), 500);
        }
    });
    
    // Set up event listeners for AI side selection
    $('input[name="aiSide"]').on('change', function() {
        const side = $(this).val() === 'none' ? null : $(this).val();
        console.log("AI side changed to:", side); // Debug log
        updateAISide(side);
    });
}

function updateAISide(side) {
    console.log("Updating AI side to:", side); // Debug log
    
    // Handle null/undefined cases
    const sideToSend = side === 'none' ? null : side;
    
    $.ajax({
        url: '/api/engine/side',
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ side: sideToSend }),
        success: function(response) {
            console.log("Successfully updated AI side:", response); // Debug log
            
            // If AI should move now, trigger its move
            const currentTurn = game.turn() === 'w' ? 'white' : 'black';
            if (side === currentTurn) {
                console.log("AI's turn after side update, triggering move with FEN:", game.fen()); // Debug log
                // Pass current FEN and null move UCI to trigger AI
                setTimeout(() => sendMoveToServer(game.fen(), null), 100); 
            }
        },
        error: function(xhr) {
            console.error('Failed to update AI side:', xhr.responseText);
        }
    });
}

// Initialize engine settings panel collapse state
function initializeSettingsPanel() {
    const sectionKey = 'engineSettings'; // Use a key for storage
    const contentElement = document.getElementById('engineSettingsContent');
    const headerElement = contentElement?.previousElementSibling; // Assumes header is right before content

    if (!contentElement || !headerElement) return;

    // Check stored collapse state
    const isCollapsed = localStorage.getItem(`${sectionKey}Collapsed`) === 'true';
    if (isCollapsed) {
        contentElement.classList.remove('show');
        headerElement.setAttribute('aria-expanded', 'false');
    } else {
        contentElement.classList.add('show');
        headerElement.setAttribute('aria-expanded', 'true');
    }
    
    // Handle collapse toggle
    headerElement.addEventListener('click', function() {
        const isNowCollapsed = contentElement.classList.contains('show'); // State *before* toggle completes
        localStorage.setItem(`${sectionKey}Collapsed`, isNowCollapsed);
        headerElement.setAttribute('aria-expanded', !isNowCollapsed);
    });
}

// Initialize analysis details panel collapse state
function initializeAnalysisPanel() {
    const sectionKey = 'analysisDetails'; 
    const contentElement = document.getElementById('analysisDetailsContent');
    const headerElement = contentElement?.previousElementSibling; 

    if (!contentElement || !headerElement) return;

    // --- Initial State Setting (remains the same) --- 
    const isCollapsedInitially = localStorage.getItem(`${sectionKey}Collapsed`) === 'true';
    if (isCollapsedInitially) {
        contentElement.classList.remove('show');
        headerElement.setAttribute('aria-expanded', 'false');
    } else {
        contentElement.classList.add('show');
        headerElement.setAttribute('aria-expanded', 'true');
        // Draw arrows initially if not collapsed and data exists
        // Note: updateAnalysis usually handles this after first move
        // if (latestAnalysisData?.analysis?.best_moves) { updateMoveArrows(latestAnalysisData.analysis.best_moves); } 
    }
    
    // --- Handle Header Click (for saving state and hiding arrows) --- 
    headerElement.addEventListener('click', function() {
        const isCurrentlyShown = contentElement.classList.contains('show');
        const willBeCollapsed = isCurrentlyShown;
        
        localStorage.setItem(`${sectionKey}Collapsed`, willBeCollapsed);
        // Bootstrap handles aria-expanded, but setting it here might be redundant/harmless
        // headerElement.setAttribute('aria-expanded', !willBeCollapsed); 

        // Clear arrows IMMEDIATELY when starting to collapse
        if (willBeCollapsed) {
            console.log("Analysis panel collapsing, clearing arrows.");
            clearMoveArrows();
        } 
        // DO NOT redraw arrows here on expand, wait for 'shown.bs.collapse'
    });

    // --- Handle Collapse Animation End (for showing arrows) --- 
    contentElement.addEventListener('shown.bs.collapse', function () {
        console.log('Analysis panel shown, attempting to draw arrows.');
        // Redraw arrows now that the element is definitely visible
        if (latestAnalysisData && latestAnalysisData.analysis && latestAnalysisData.analysis.best_moves) {
            updateMoveArrows(latestAnalysisData.analysis.best_moves);
        } else {
            console.log("No arrow data available to draw.");
        }
    });
    
    // Optional: Handle hiding animation end if needed (usually not necessary for arrows)
    // contentElement.addEventListener('hidden.bs.collapse', function () {
    //     console.log('Analysis panel hidden');
    // });
}

// Initialize the board when the page loads
$(document).ready(function() {
    board = Chessboard('board', boardConfig);
    
    // --- Dark Mode Handling --- 
    const darkModeToggle = document.getElementById('darkModeToggle');
    const currentTheme = localStorage.getItem('theme') ? localStorage.getItem('theme') : null;

    if (currentTheme === 'dark') {
        document.body.classList.add('dark-mode');
        darkModeToggle.checked = true;
    }

    darkModeToggle.addEventListener('change', function() {
        if(darkModeToggle.checked) {
            document.body.classList.add('dark-mode');
            localStorage.setItem('theme', 'dark');
        } else {
            document.body.classList.remove('dark-mode');
            localStorage.setItem('theme', 'light'); 
        }
    });
    // --- End Dark Mode Handling ---

    // Set up event listeners for buttons
    $('#newGame').on('click', newGame);
    $('#undoMove').on('click', undoMove);
    $('#flipBoard').on('click', flipBoard);
    $('#moveBack').on('click', viewPreviousPosition);
    $('#moveForward').on('click', viewNextPosition);
    
    // Set up socket.io event listeners
    socket.on('analysis_update', updateAnalysis);
    
    // Initialize settings & panels
    initializeEngineSettings();
    initializeAISide();
    initializeSettingsPanel();
    initializeAnalysisPanel(); // Initialize the new panel

    // Add listener for modal's New Game button
    $('#modalNewGame').on('click', function() {
        const modalElement = document.getElementById('gameOverModal');
        if (modalElement) {
            const modal = bootstrap.Modal.getInstance(modalElement);
            if (modal) {
                modal.hide();
            }
        }
        newGame(); // Call the existing new game function
    });

    // Add CSS for check indicator
    const style = document.createElement('style');
    style.textContent = `
        .square-55d63.in-check {
            position: relative;
            box-shadow: inset 0 0 0 3px red !important;
        }
        
        /* Add overlay instead of changing background */
        .square-55d63.in-check:after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(255, 0, 0, 0.3);
            pointer-events: none; /* Allow clicks to pass through */
            z-index: 2;
        }
        
        /* Remove the pulsating king animation */
    `;
    document.head.appendChild(style);

    // Update move navigation button states
    updateMoveNavigationButtons();
});

// Chess board event handlers
function onDragStart(source, piece, position, orientation) {
    // Prevent moving pieces if it's not the player's turn
    if (game.game_over()) return false;
    if ((game.turn() === 'w' && piece.search(/^b/) !== -1) ||
        (game.turn() === 'b' && piece.search(/^w/) !== -1)) {
        return false;
    }
}

// Add a function to check if it's AI's turn
function isAITurn() {
    const currentTurn = game.turn() === 'w' ? 'white' : 'black';
    return new Promise((resolve) => {
        $.get('/api/engine/side', function(settings) {
            // Handle potential null or undefined response
            if (!settings || settings.ai_side === undefined) {
                console.log("Could not determine AI side, defaulting to false"); // Debug log
                resolve(false);
                return;
            }
            const shouldMove = settings.ai_side === currentTurn;
            console.log(`Checking AI turn - Current: ${currentTurn}, AI: ${settings.ai_side}, Should move: ${shouldMove}`); // Debug log
            resolve(shouldMove);
        }).fail(function(error) {
            console.error("Failed to get AI side:", error); // Debug log
            resolve(false);
        });
    });
}

// Add function to highlight king in check
function updateCheckStatus() {
    // Clear previous check indicator
    clearCheckIndicator();
    
    // Check if a king is in check
    if (game.in_check()) {
        const turn = game.turn();
        const board8x8 = game.board();
        
        // Find the king's position
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = board8x8[row][col];
                if (piece && piece.type === 'k' && piece.color === turn) {
                    // Convert to algebraic notation
                    const file = String.fromCharCode('a'.charCodeAt(0) + col);
                    const rank = 8 - row;
                    const square = file + rank;
                    
                    // Highlight the square
                    highlightCheckSquare(square);
                    return;
                }
            }
        }
    }
}

function highlightCheckSquare(square) {
    checkSquare = square;
    
    // Get the square element and add a class
    const squareElement = document.querySelector(`.square-${square}`);
    if (squareElement) {
        squareElement.classList.add('in-check');
        // We don't need to add the class to the piece anymore as our CSS handles it
    }
}

function clearCheckIndicator() {
    // Remove all check highlights
    document.querySelectorAll('.in-check').forEach(el => {
        el.classList.remove('in-check');
    });
    
    checkSquare = null;
}

// Modify sendMoveToServer to handle check status
async function sendMoveToServer(fen_before_move, move_uci) {
    console.log(`Sending move to server: Move=${move_uci}, FEN Before=${fen_before_move}`); // Debug log
    
    const data = {
        fen: fen_before_move, 
        move: move_uci        
    };
    
    console.log("Sending data to server:", data);
    
    try {
        const response = await $.ajax({
            url: '/api/move',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(data)
        });
        
        console.log("Server response:", response);
        
        if (response.success) {
            latestAnalysisData = response; 

            if (response.fen && response.fen !== game.fen()) {
                console.log("Updating game state with FEN from server:", response.fen);
                
                // Check if an AI move was made after the human move
                const aiMoveMade = response.ai_move !== null && response.ai_move !== undefined;
                
                if (aiMoveMade && move_uci) {
                    // If both human and AI moved, we need to capture the intermediate state too
                    // Create a temporary game to simulate just the human move
                    const tempGame = new Chess(fen_before_move);
                    
                    // Apply just the human move to get intermediate position
                    const from = move_uci.substring(0, 2);
                    const to = move_uci.substring(2, 4);
                    let promotion = undefined;
                    if (move_uci.length > 4) {
                        promotion = move_uci.substring(4, 5);
                    }
                    
                    const moveResult = tempGame.move({
                        from: from,
                        to: to,
                        promotion: promotion
                    });
                    
                    if (moveResult) {
                        // Get the position after just the human move
                        const intermediatePosition = tempGame.fen();
                        
                        // Add the intermediate position to history if it's not a duplicate
                        if (fenHistory[fenHistory.length - 1] !== intermediatePosition) {
                            fenHistory.push(intermediatePosition);
                            console.log("Added intermediate position to FEN history:", intermediatePosition);
                        }
                    }
                }
                
                // Update the actual game with the final position (after both human and AI moves)
                game.load(response.fen);
                board.position(game.fen());

                // Add the final position to history (if different)
                if (fenHistory[fenHistory.length - 1] !== response.fen) {
                    fenHistory.push(response.fen);
                    console.log("FEN History updated:", fenHistory);
                }
                
                // Update check status after position change
                updateCheckStatus();

                // Update the currentViewIndex to point to the latest position if not in history mode
                if (!isViewingHistory) {
                    currentViewIndex = fenHistory.length - 1;
                    updateMoveNavigationButtons();
                }
            }
            
            updateAnalysis(response); 
            
            if (game.game_over()) {
                let resultMessage = "Game Over!";
                if (game.in_checkmate()) {
                    const winner = game.turn() === 'w' ? 'Black' : 'White';
                    resultMessage = `Checkmate! ${winner} wins.`;
                } else if (game.in_stalemate()) {
                    resultMessage = "Stalemate! It's a draw.";
                } else if (game.in_threefold_repetition()) {
                    resultMessage = "Draw by Threefold Repetition.";
                } else if (game.insufficient_material()) {
                    resultMessage = "Draw by Insufficient Material.";
                } else if (game.in_draw()) {
                    // Covers 50-move rule and potentially other draw conditions
                    resultMessage = "The game is a draw.";
                }
                
                // Update and show the modal
                $('#gameOverMessage').text(resultMessage);
                const gameOverModal = new bootstrap.Modal(document.getElementById('gameOverModal'));
                gameOverModal.show();
            } 
        } else {
            console.error("Move error from server:", response.error); // Debug log
            alert('Server Error: ' + (response.error || 'Invalid move'));
            // Return false to indicate failure
            return false; 
        }
        
        return true; 
    } catch (error) {
        latestAnalysisData = null; // Clear data on error (Re-added)
        console.error('Failed to process move via AJAX:', error);
        alert('AJAX Error: Failed to communicate with server');
        // Return false to indicate failure
        return false; 
    }
}

// Modify onDrop for correct validation and visual flow
async function onDrop(source, target) {
    console.log(`Attempting drop: ${source} -> ${target}`);
    
    // If in history viewing mode, exit it and return to current position before allowing move
    if (isViewingHistory) {
        isViewingHistory = false;
        currentViewIndex = fenHistory.length - 1;
        updateBoardToHistoryPosition();
        updateMoveNavigationButtons();
        return false; // Prevent the current drop, requiring the user to try again from current position
    }
    
    // Store position before any changes
    const fen_before_move = game.fen();
    
    // Try the move in the local game object
    const move = game.move({
        from: source,
        to: target,
        promotion: 'q' 
    });

    // --- IMMEDIATELY handle locally illegal moves ---
    if (move === null) {
        console.log("Drop rejected: Locally illegal move (chess.js)");
        // FORCE animated redraw of the entire board instead of relying on snapback
        window.setTimeout(function() {
            board.position(fen_before_move, true);
        }, 10); // Small timeout to ensure UI thread clears
        return false; // Don't use 'snapback', handle reset manually
    }

    // If we reach here, the move was locally legal according to chess.js
    console.log("Drop accepted locally (chess.js):", move);

    // --- Revert Local State (as server is source of truth for *next* state) --- 
    game.undo(); // Clean undo instead of forcing load
    console.log("Local game state reverted pending server validation");

    // --- Asynchronous Checks and Server Call --- 
    try {
        // Check AI turn
        const aiTurn = await isAITurn();
        if (aiTurn) {
            console.log("Drop rejected: AI's turn");
            // Force animated redraw to ensure visual reset
            board.position(fen_before_move, true);
            return false;
        }

        // Construct UCI string
        let move_uci = source + target;
        if (move.promotion) {
            move_uci += move.promotion;
        }
        
        // Send validated move attempt to server
        const success = await sendMoveToServer(fen_before_move, move_uci);
        
        // Handle Server Response (Success updates board inside sendMoveToServer)
        if (!success) {
            console.log("Server rejected move or error occurred");
            // Force animated redraw to ensure visual reset
            board.position(fen_before_move, true);
            return false;
        }
        
        console.log("Server processed move successfully and updated board");
        return true;

    } catch (error) {
        console.error("Error during async part of onDrop:", error);
        alert("An unexpected error occurred during the move processing");
        // Force animated redraw to ensure visual reset
        board.position(fen_before_move, true);
        return false;
    }
}

// Game control functions
// Modify newGame to reset FEN history
async function newGame() {
    console.log("Starting new game...");
    game = new Chess();
    board.position('start'); 
    latestAnalysisData = null; 
    fenHistory = [game.fen()]; // Reset history with starting FEN
    currentViewIndex = 0; // Reset view index
    isViewingHistory = false; // Exit history viewing mode
    
    console.log("FEN History reset:", fenHistory);
    clearAnalysis();
    clearCheckIndicator(); // Clear any check indicators
    updateMoveNavigationButtons(); // Update button states
    
    // Get the current AI side setting
    let currentAISide = 'none';
    try {
        // Use await with $.get for cleaner async handling
        const settings = await $.get('/api/engine/side'); 
        currentAISide = settings.ai_side || 'none';
        console.log("AI side for new game:", currentAISide);
    } catch (error) {
        console.error("Failed to get AI side for new game:", error);
        // Proceed assuming no AI for safety
    }

    // Check if AI should make the first move (AI is white)
    if (currentAISide === 'white') {
        console.log("AI is white, attempting first move with FEN:", game.fen()); // Debug log
        // Send starting FEN and null move UCI to trigger AI
        await sendMoveToServer(game.fen(), null); 
    }
}

// Undo function using FEN history
async function undoMove() {
    // Need at least 2 FENs: the current one and the one to revert to
    if (fenHistory.length < 2) {
        console.log("Nothing to undo in FEN history.");
        return; 
    }

    console.log("Undo requested. Current FEN history length:", fenHistory.length);

    // 1. Remove the current FEN from history
    fenHistory.pop();
    
    // 2. Get the target FEN (the new last element)
    const revertedFen = fenHistory[fenHistory.length - 1];
    console.log("Target FEN after undo:", revertedFen);

    // 3. Update local game state and visual board
    // It's important to load the FEN locally *before* calling the API
    // to ensure the UI reflects the state being sent for analysis.
    try {
        game.load(revertedFen);
        board.position(revertedFen);
        console.log("Local state reverted.");
        
        // Update check status after reverting
        updateCheckStatus();
    } catch (e) {
        console.error("Error loading reverted FEN locally:", e);
        alert("Error reverting board state locally. History might be corrupted.");
        return; 
    }

    // 4. Clear current analysis visuals and stored data
    latestAnalysisData = null; 
    clearAnalysis(); 

    // 5. Send reverted FEN to backend to sync engine and get new analysis
    console.log("Sending undo request to server...");
    try {
        const response = await $.ajax({
            url: '/api/undo', 
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ fen: revertedFen })
        });

        console.log("Undo server response:", response);
        if (response.success) {
            // Update analysis display with data for the reverted position
            updateAnalysis(response); 
        } else {
            console.error("Undo failed on server:", response.error);
            alert("Undo failed on server: " + response.error);
            // Engine is now out of sync with the reverted frontend state.
        }
    } catch (error) {
        console.error("Failed to send undo request:", error);
        alert("Error communicating with server during undo.");
        // Engine is out of sync.
    }

    // After successful undo:
    isViewingHistory = false;
    currentViewIndex = fenHistory.length - 1; // Point to the new current position
    updateMoveNavigationButtons(); // Update button states
}

function flipBoard() {
    board.flip();
}

// Analysis update functions
function updateAnalysis(data) {
    if (!data) return; 
    latestAnalysisData = data; // Update stored data (Re-added)

    // Update all components - visibility handled by collapse/CSS
    updateEvaluationBar(data.analysis?.evaluation);
    updateBestMoves(data.analysis?.best_moves || []); 
    updateLearningInsights(data.insights || {}); 
    updatePositionalFeatures(data.insights?.positional_features || {}); 
    
    // Update arrows - updateMoveArrows will check visibility internally
    updateMoveArrows(data.analysis?.best_moves || []); 
}

function updateEvaluationBar(evaluation) {
    const bar = $('.evaluation-fill');
    const label = $('.evaluation-label');
    let value = 0;
    let labelText = 'Even';
    
    if (!evaluation) {
        bar.css('width', '50%');
        bar.css('left', '0');
        bar.css('background-color', '#6c757d'); // Gray for unknown
        label.text(labelText);
        return;
    }
    
    if (evaluation.type === 'cp') {
        value = evaluation.value / 100; // Convert centipawns to pawns
        
        // Format the label based on the advantage
        if (Math.abs(value) < 0.2) {
            labelText = 'Even';
        } else {
            const side = value > 0 ? 'White' : 'Black';
            const absValue = Math.abs(value).toFixed(1);
            labelText = `${side} +${absValue}`;
        }
    } else if (evaluation.type === 'mate') {
        value = evaluation.value > 0 ? 10 : -10; // Max evaluation for mate
        const movesToMate = Math.abs(evaluation.value);
        const side = evaluation.value > 0 ? 'White' : 'Black';
        labelText = `${side} M${movesToMate}`;
    }
    
    // Normalize value to percentage (-10 to 10 becomes 0 to 100)
    const percentage = Math.min(Math.max((value + 10) * 5, 0), 100);
    bar.css('width', percentage + '%');
    bar.css('left', percentage <= 50 ? '50%' : (100 - percentage) + '%');
    bar.css('background-color', value >= 0 ? '#28a745' : '#dc3545');
    
    // Update the label text
    label.text(labelText);
}

function updateBestMoves(bestMoves) {
    const container = $('#bestMoves');
    container.empty();
    if (!bestMoves) return; 
    bestMoves.forEach((move, index) => {
        const moveElement = $('<div>').addClass('move-item');
        moveElement.html(`
            <strong>${index + 1}.</strong> ${move.Move}
            <span class="evaluation">${move.Centipawn / 100}</span>
        `);
        container.append(moveElement);
    });
}

function updateLearningInsights(insights) {
    const container = $('#learningInsights');
    container.empty();
    if (!insights) return; 
    // Add material balance
    const material = insights.material_balance;
    container.append($('<div>').text(`Material Balance: ${material > 0 ? '+' : ''}${material}`));
    
    // Add learning points
    insights.learning_points.forEach(point => {
        container.append($('<div>').text(point));
    });
    
    // Add suggested improvements
    if (insights.suggested_improvements.length > 0) {
        container.append($('<h5>').text('Suggested Improvements:'));
        insights.suggested_improvements.forEach(improvement => {
            container.append($('<div>').text(improvement));
        });
    }
}

function updatePositionalFeatures(features) {
    const container = $('#positionalFeatures');
    container.empty();
    if (!features) return; 
    // Center control
    const centerControl = features.center_control;
    container.append($('<div>').text(
        `Center Control - White: ${centerControl.white}, Black: ${centerControl.black}`
    ));
    
    // Piece activity
    const activity = features.piece_activity;
    container.append($('<div>').text(
        `Developed Pieces - White: ${activity.white_developed}, Black: ${activity.black_developed}`
    ));
    
    // King safety
    const kingSafety = features.king_safety;
    container.append($('<div>').text(
        `King Safety - White: ${kingSafety.white_king_safety}, Black: ${kingSafety.black_king_safety}`
    ));
}

function createMoveArrow(from, to, arrowClass) {
    const boardElement = document.getElementById('board');
    if (!boardElement) return null;
    const boardRect = boardElement.getBoundingClientRect();
    const squareSize = boardRect.width / 8;
    
    let fromFile = from.charCodeAt(0) - 'a'.charCodeAt(0);
    let fromRank = 8 - parseInt(from[1]);
    let toFile = to.charCodeAt(0) - 'a'.charCodeAt(0);
    let toRank = 8 - parseInt(to[1]);
    
    const orientation = board.orientation();
    if (orientation === 'black') {
        fromFile = 7 - fromFile;
        fromRank = 7 - fromRank;
        toFile = 7 - toFile;
        toRank = 7 - toRank;
    }
    
    const fromX = fromFile * squareSize + squareSize / 2;
    const fromY = fromRank * squareSize + squareSize / 2;
    const toX = toFile * squareSize + squareSize / 2;
    const toY = toRank * squareSize + squareSize / 2;
    
    const angle = Math.atan2(toY - fromY, toX - fromX);
    const distance = Math.sqrt(Math.pow(toX - fromX, 2) + Math.pow(toY - fromY, 2));
    
    if (distance < 1) return null;

    const arrow = document.createElement('div');
    arrow.className = `move-arrow ${arrowClass}`;
    
    const container = boardElement.parentElement;
    if (!container) return null;
    const containerRect = container.getBoundingClientRect();
    const boardOffsetX = boardRect.left - containerRect.left;
    const boardOffsetY = boardRect.top - containerRect.top;
    
    arrow.style.left = `${boardOffsetX + fromX}px`;
    arrow.style.top = `${boardOffsetY + fromY}px`;
    arrow.style.width = `${distance}px`;
    arrow.style.transform = `rotate(${angle}rad)`;
    
    container.appendChild(arrow);
    
    return arrow;
}

function clearMoveArrows() {
    const arrows = document.querySelectorAll('.move-arrow');
    arrows.forEach(arrow => arrow.remove());
}

function updateMoveArrows(bestMoves) {
    clearMoveArrows(); // Always clear existing arrows first
    
    // --- Check if we're viewing history or not the current position ---
    if (isViewingHistory || currentViewIndex !== fenHistory.length - 1) {
        // Don't show arrows when viewing history
        return;
    }
    
    // --- Check if analysis details section is visible --- 
    const analysisContent = document.getElementById('analysisDetailsContent');
    if (!analysisContent || !analysisContent.classList.contains('show')) {
        // console.log("Skipping arrow drawing: Analysis panel is collapsed.");
        return; // Do nothing if the panel is collapsed
    }
    // --- End Visibility Check --- 
    
    if (!bestMoves || bestMoves.length === 0) {
        // console.log("Skipping arrow drawing: No best moves data.");
        return;
    }
    
    // console.log("Drawing move arrows...");
    bestMoves.forEach((move, index) => {
        let from, to;
        if (move.Move && move.Move.length >= 4) {
            from = move.Move.substring(0, 2).toLowerCase();
            to = move.Move.substring(2, 4).toLowerCase();
        } else {
            console.warn('Invalid move format or missing move data:', move);
            return; 
        }
        const arrowClass = (index === 0) ? 'arrow-best' : 'arrow-alternative';
        createMoveArrow(from, to, arrowClass);
    });
}

function clearAnalysis() {
    $('.evaluation-fill').css('width', '0');
    $('#bestMoves').empty(); 
    $('#learningInsights').empty();
    $('#positionalFeatures').empty();
    clearMoveArrows();
    clearCheckIndicator(); // Also clear check indicator
    latestAnalysisData = null; // Clear stored data
}

// Functions for browsing through move history
function viewPreviousPosition() {
    if (currentViewIndex > 0) {
        currentViewIndex--; // Move back one position at a time
        isViewingHistory = true;
        updateBoardToHistoryPosition();
        updateMoveNavigationButtons();
    }
}

function viewNextPosition() {
    if (currentViewIndex < fenHistory.length - 1) {
        currentViewIndex++;
        updateBoardToHistoryPosition();
        updateMoveNavigationButtons();
        
        // If we've returned to the current position, exit history viewing mode
        if (currentViewIndex === fenHistory.length - 1) {
            isViewingHistory = false;
            
            // Restore move arrows for current position if we have analysis data
            if (latestAnalysisData && latestAnalysisData.analysis && latestAnalysisData.analysis.best_moves) {
                updateMoveArrows(latestAnalysisData.analysis.best_moves);
            }
        }
    }
}

function updateBoardToHistoryPosition() {
    // Clear any move arrows when viewing history
    clearMoveArrows();
    
    // Only update the visual board, not the game state
    const historicalFen = fenHistory[currentViewIndex];
    
    // Use a temporary game object to get position data without affecting the main game
    const tempGame = new Chess(historicalFen);
    board.position(tempGame.fen());
    
    // Check if we need to update check indicator
    if (tempGame.in_check()) {
        const turn = tempGame.turn();
        const board8x8 = tempGame.board();
        
        // Find the king's position
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = board8x8[row][col];
                if (piece && piece.type === 'k' && piece.color === turn) {
                    // Convert to algebraic notation
                    const file = String.fromCharCode('a'.charCodeAt(0) + col);
                    const rank = 8 - row;
                    const square = file + rank;
                    
                    // Highlight the square
                    highlightCheckSquare(square);
                    break;
                }
            }
        }
    } else {
        clearCheckIndicator();
    }
}

function updateMoveNavigationButtons() {
    // Disable back button if we're at the first position
    $('#moveBack').prop('disabled', currentViewIndex === 0);
    
    // Disable forward button if we're at the current/latest position
    $('#moveForward').prop('disabled', currentViewIndex === fenHistory.length - 1);
    
    // Update move counter with a more intuitive display
    let displayText;
    
    if (currentViewIndex === 0) {
        displayText = "Start";
    } else {
        // Calculate the move number (each full move is white+black)
        // Each player's move increments the index by 1
        const moveNumber = Math.ceil(currentViewIndex / 2);
        const isWhiteTurn = currentViewIndex % 2 === 1; // White = odd indices (1, 3, 5...)
        
        // Format: "3.W" for move 3, white's turn
        displayText = `${moveNumber}.${isWhiteTurn ? 'W' : 'B'}`;
    }
    
    // Add total moves for context
    const totalMoves = Math.ceil((fenHistory.length - 1) / 2);
    $('#moveHistoryStatus').text(`${displayText}/${totalMoves}`);
    
    // Apply visual indication if viewing history
    if (isViewingHistory) {
        $('#moveHistoryStatus').addClass('text-primary');
    } else {
        $('#moveHistoryStatus').removeClass('text-primary');
    }
}