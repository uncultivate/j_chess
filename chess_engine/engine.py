import os
from stockfish import Stockfish, StockfishException
import chess
from dotenv import load_dotenv

load_dotenv()

class ChessEngine:
    def __init__(self):
        stockfish_path = os.getenv('STOCKFISH_PATH')
        if not stockfish_path:
            raise ValueError("STOCKFISH_PATH environment variable not set")
        
        self._engine = Stockfish(path=stockfish_path)
        
        # Separate settings for AI opponent and Analysis
        self._ai_depth = 5       # Default AI opponent depth (lower)
        self._skill_level = 10   # Default AI opponent skill (0-20)
        self._analysis_depth = 15 # Fixed higher depth for analysis
        
        self._ai_side = 'black'
        self._board = chess.Board()
        self._apply_ai_settings() # Apply initial AI settings
    
    # --- Helper methods to apply settings --- 
    def _apply_ai_settings(self):
        """Applies AI opponent settings to the engine."""
        try:
            self._engine.set_depth(self._ai_depth)
            params = {
                "Skill Level": self._skill_level,
                "UCI_LimitStrength": "true" # Enable skill limit for AI moves
            }
            self._engine.update_engine_parameters(params)
            # print(f"Engine: Applied AI settings - Depth: {self._ai_depth}, Skill: {self._skill_level}")
        except StockfishException as e:
            print(f"Error applying AI settings: {e}")

    def _apply_analysis_settings(self):
        """Applies Analysis settings to the engine."""
        try:
            self._engine.set_depth(self._analysis_depth)
            params = {
                "Skill Level": 20, # Max skill for analysis
                "UCI_LimitStrength": "false" # Disable skill limit for analysis
            }
            self._engine.update_engine_parameters(params)
            # print(f"Engine: Applied Analysis settings - Depth: {self._analysis_depth}")
        except StockfishException as e:
            print(f"Error applying analysis settings: {e}")
            
    def set_position(self, fen):
        print(f"Engine: Setting position via FEN: {fen}")
        try:
            self._board.set_fen(fen)
            self._engine.set_fen_position(fen)
            return True
        except (ValueError, StockfishException) as e:
            print(f"Error setting position: {e}")
            return False
    
    def set_ai_side(self, side):
        print(f"Engine: Setting AI side to: {side}")
        self._ai_side = side
    
    def get_ai_side(self):
        return self._ai_side
    
    def should_ai_move(self):
        if not self._ai_side or self._ai_side == 'none':
            return False
        current_turn = 'white' if self._board.turn == chess.WHITE else 'black'
        should_move = current_turn == self._ai_side
        return should_move
    
    def is_valid_move(self, move_uci):
        try:
            if not move_uci:
                return False
            move = chess.Move.from_uci(move_uci.strip().lower())
            is_valid = move in self._board.legal_moves
            return is_valid
        except ValueError:
            return False
        except Exception as e:
            print(f"Error validating move {move_uci}: {e}")
            return False
    
    def make_move(self, move_uci):
        print(f"Engine: Attempting to make move: {move_uci} on board: {self._board.fen()}")
        try:
            if not self.is_valid_move(move_uci):
                print(f"Engine: Invalid move rejected: {move_uci}")
                return False
                
            move = chess.Move.from_uci(move_uci.strip().lower())
            self._board.push(move)
            new_fen = self._board.fen()
            print(f"Engine: Board updated. New FEN: {new_fen}")
            
            self._engine.set_fen_position(new_fen)
            print(f"Engine: Successfully made move: {move_uci}")
            return True
        except (ValueError, StockfishException) as e:
            print(f"Error making move {move_uci}: {e}")
            return False
    
    def get_ai_move(self):
        current_fen = self._board.fen()
        print(f"Engine: Getting AI move for: {current_fen}")
        try:
            self._apply_ai_settings() # Apply AI settings before getting move
            best_move = self._engine.get_best_move()
            print(f"Engine: AI Suggested move (using AI settings): {best_move}")
            
            if not best_move:
                print("Engine: Did not return a move")
                return None
                
            if self.is_valid_move(best_move):
                print(f"Engine: Selected valid move: {best_move}")
                return best_move
            else:
                print(f"Engine: ERROR - Suggested invalid move: {best_move} for FEN: {current_fen}")
                print(f"Legal moves were: {list(self._board.legal_moves)}")
                return None
        except StockfishException as e:
            print(f"Stockfish error getting AI move: {e}")
            return None
        except Exception as e:
            print(f"General error getting AI move: {e}")
            return None
    
    def get_engine_settings(self):
        # Return the settings relevant to the UI controls (AI opponent)
        return {
            'depth': self._ai_depth, # Return AI depth
            'skill_level': self._skill_level,
            'ai_side': self._ai_side
        }
    
    def update_engine_settings(self, depth=None, skill_level=None):
        # This function now updates only AI opponent settings
        if depth is not None:
            self._ai_depth = max(1, min(30, depth)) 
            print(f"Engine: AI Depth set to: {self._ai_depth}")
        if skill_level is not None:
            self._skill_level = max(0, min(20, skill_level))
            print(f"Engine: AI Skill Level set to: {self._skill_level}")
        
        # Apply the new AI settings immediately if needed (or rely on get_ai_move)
        # self._apply_ai_settings() 
        print(f"Engine AI settings updated - Depth: {self._ai_depth}, Skill Level: {self._skill_level}")

    def analyze_position(self, fen):
        print(f"Engine: Analyzing FEN (using Analysis settings): {fen}")
        try:
            # Ensure correct FEN is set before applying analysis settings
            self._engine.set_fen_position(fen) 
            self._apply_analysis_settings() # Apply analysis settings
            
            evaluation = self._engine.get_evaluation()
            best_moves = self._engine.get_top_moves(3) 
            return {
                'evaluation': evaluation,
                'best_moves': best_moves
            }
        except (ValueError, StockfishException) as e:
            print(f"Error analyzing position {fen}: {e}")
            return {
                'evaluation': {'type': 'cp', 'value': 0},
                'best_moves': []
            }

    def get_move_suggestions(self, fen, num_moves=3):
        print(f"Engine: Getting suggestions (using Analysis settings) for FEN: {fen}")
        try:
            self._engine.set_fen_position(fen)
            self._apply_analysis_settings() # Apply analysis settings
            return self._engine.get_top_moves(num_moves) 
        except (ValueError, StockfishException) as e:
            print(f"Error getting suggestions for {fen}: {e}")
            return [] 