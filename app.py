from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO
from dotenv import load_dotenv
import os
import chess
from chess_engine.engine import ChessEngine
from learning.analyzer import PositionAnalyzer

# Load environment variables
load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev')
socketio = SocketIO(app)

# Initialize chess engine
chess_engine = ChessEngine()
position_analyzer = PositionAnalyzer()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/move', methods=['POST'])
def make_move():
    data = request.get_json()
    move_uci = data.get('move') # e.g., "d2d4" or null for AI trigger
    fen_before_move = data.get('fen') # FEN *before* the move_uci was attempted
    
    print(f"API: Received move request - Move: {move_uci}, FEN Before: {fen_before_move}")
    
    # --- Set Engine State to BEFORE the move --- 
    if not chess_engine.set_position(fen_before_move):
        print(f"API: Error - Failed to set engine position with FEN: {fen_before_move}")
        return jsonify({'success': False, 'error': 'Invalid FEN received'})
    
    # Engine's internal board now reflects fen_before_move
    board = chess_engine._board 
    print(f"API: Engine board FEN set to: {board.fen()}")
    # print(f"API: Legal moves according to engine board: {list(board.legal_moves)}")

    human_move_made = False
    ai_move_made_uci = None # Store the AI move if one is made
    
    try:
        # --- Process Human Move (if any) --- 
        if move_uci:
            print(f"API: Processing human move: {move_uci}")
            # make_move validates against the current board state (fen_before_move) 
            # and updates the engine's internal board if valid.
            if chess_engine.make_move(move_uci):
                print(f"API: Human move {move_uci} successful (Engine board updated).")
                human_move_made = True
            else:
                print(f"API: Illegal human move: {move_uci} for FEN {fen_before_move}")
                # Return error immediately if human move is invalid
                return jsonify({'success': False, 'error': f'Illegal move: {move_uci}'}) 
        else:
            print("API: No human move provided (likely AI trigger).")

        # --- Check and Process AI Move (if applicable) --- 
        # Check if AI should move based on the board state *after* the potential human move
        if chess_engine.should_ai_move(): 
            print(f"API: AI's turn. Getting AI move for position: {board.fen()}")
            ai_move_made_uci = chess_engine.get_ai_move()
            print(f"API: AI suggested move: {ai_move_made_uci}")
            
            if ai_move_made_uci:
                # Make the AI move (validates and updates engine board)
                if chess_engine.make_move(ai_move_made_uci):
                    print(f"API: AI move {ai_move_made_uci} successful (Engine board updated).")
                else:
                    # This is a serious issue - engine suggested then rejected its own move
                    print(f"API: Error - AI move {ai_move_made_uci} deemed illegal after generation?")
                    return jsonify({'success': False, 'error': f'Engine generated invalid move: {ai_move_made_uci}'}) 
            else:
                print("API: AI did not return a move (or suggested invalid one).")
        else:
            print("API: Not AI's turn.")

        # --- Prepare Response --- 
        # Get the final state from the engine's board
        final_fen = board.fen()
        analysis = chess_engine.analyze_position(final_fen)
        insights = position_analyzer.analyze_position(final_fen)
        
        response = {
            'success': True,
            'fen': final_fen, # The FEN *after* all successful moves (human and/or AI)
            'analysis': analysis,
            'insights': insights,
            'ai_move': ai_move_made_uci # Send back AI move UCI if one was made this turn
        }
        print(f"API: Sending successful response: {response}")
        return jsonify(response)
        
    except Exception as e:
        print(f"API: Error processing move sequence: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': f'Server error: {str(e)}'})

@app.route('/api/undo', methods=['POST'])
def undo_move():
    data = request.get_json()
    fen_after_undo = data.get('fen') # Get the FEN state we want to revert TO
    
    if not fen_after_undo:
        print("API: Undo request missing FEN.")
        return jsonify({'success': False, 'error': 'FEN required for undo'}), 400
        
    print(f"API: Received undo request. Reverting engine to FEN: {fen_after_undo}")
    
    try:
        # Set the engine's position to the provided FEN
        if not chess_engine.set_position(fen_after_undo):
            print(f"API: Error - Failed to set engine position during undo: {fen_after_undo}")
            return jsonify({'success': False, 'error': 'Invalid FEN during undo'}) 
        
        # Get analysis and insights for the reverted position
        # Note: analyze_position uses the higher analysis settings automatically
        analysis = chess_engine.analyze_position(fen_after_undo)
        insights = position_analyzer.analyze_position(fen_after_undo)
        
        response = {
            'success': True,
            'fen': fen_after_undo, # Confirm the FEN state
            'analysis': analysis,
            'insights': insights
            # No 'ai_move' here, as we don't trigger one on undo
        }
        print(f"API: Sending undo response: {response}")
        return jsonify(response)
        
    except Exception as e:
        print(f"API: Error processing undo request: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': f'Server error during undo: {str(e)}'}), 500

@socketio.on('analyze_position')
def handle_analysis(fen):
    analysis = chess_engine.analyze_position(fen)
    insights = position_analyzer.analyze_position(fen)
    socketio.emit('analysis_update', {
        'analysis': analysis,
        'insights': insights
    })

@app.route('/api/engine/settings', methods=['GET', 'POST'])
def handle_engine_settings():
    if request.method == 'POST':
        data = request.get_json()
        depth = data.get('depth')
        skill_level = data.get('skill_level')
        
        # Validate input (optional but good practice)
        if depth is not None:
            try:
                depth = int(depth)
                if not (1 <= depth <= 30): # Use appropriate limits
                    raise ValueError("Depth out of range")
            except ValueError:
                 return jsonify({'error': 'Invalid depth value'}), 400
        
        if skill_level is not None:
            try:
                skill_level = int(skill_level)
                if not (0 <= skill_level <= 20):
                     raise ValueError("Skill level out of range")
            except ValueError:
                return jsonify({'error': 'Invalid skill level value'}), 400
        
        # Update settings using the correct method name
        print(f"API: Updating AI settings - Depth: {depth}, Skill: {skill_level}")
        chess_engine.update_engine_settings(depth=depth, skill_level=skill_level)
        
        # Get the current settings after update to return them
        current_settings = chess_engine.get_engine_settings()
        print(f"API: Returning updated AI settings: {current_settings}")
        return jsonify(current_settings)
    else:
        # GET request - return current settings
        current_settings = chess_engine.get_engine_settings()
        print(f"API: Getting current AI settings: {current_settings}")
        return jsonify(current_settings)

@app.route('/api/engine/side', methods=['GET', 'POST'])
def handle_engine_side():
    if request.method == 'POST':
        data = request.get_json()
        side = data.get('side') # Expects 'white', 'black', or null
        
        # Validate and set the side in the engine
        if side not in ['white', 'black', None]:
            print(f"API: Invalid side received: {side}. Setting to None.")
            side = None # Default to None for invalid inputs
            
        # Update AI side in the engine instance
        chess_engine.set_ai_side(side)
        print(f"API: AI side set to {side}")
        
        # Return the successfully set side
        return jsonify({'ai_side': side})
    else:
        # GET request - return current side from the engine
        current_side = chess_engine.get_ai_side()
        print(f"API: Getting current AI side: {current_side}")
        # Ensure response is always a valid JSON object
        return jsonify({'ai_side': current_side})

if __name__ == '__main__':
    socketio.run(app, debug=True) 