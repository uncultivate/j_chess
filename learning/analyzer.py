import chess
from chess_engine.engine import ChessEngine

class PositionAnalyzer:
    def __init__(self):
        self.chess_engine = ChessEngine()
    
    def analyze_position(self, fen):
        """Analyze the position and provide learning insights"""
        board = chess.Board(fen)
        analysis = self.chess_engine.analyze_position(fen)
        
        insights = {
            'material_balance': self._calculate_material_balance(board),
            'positional_features': self._analyze_positional_features(board),
            'suggested_improvements': self._get_suggested_improvements(analysis),
            'learning_points': self._generate_learning_points(analysis)
        }
        
        return insights
    
    def _calculate_material_balance(self, board):
        """Calculate material balance between white and black"""
        piece_values = {
            'P': 1, 'N': 3, 'B': 3, 'R': 5, 'Q': 9, 'K': 0,
            'p': -1, 'n': -3, 'b': -3, 'r': -5, 'q': -9, 'k': 0
        }
        
        material = 0
        for piece in board.piece_map().values():
            material += piece_values[piece.symbol()]
        
        return material
    
    def _analyze_positional_features(self, board):
        """Analyze positional features of the current position"""
        features = {
            'center_control': self._evaluate_center_control(board),
            'piece_activity': self._evaluate_piece_activity(board),
            'pawn_structure': self._evaluate_pawn_structure(board),
            'king_safety': self._evaluate_king_safety(board)
        }
        return features
    
    def _evaluate_center_control(self, board):
        """Evaluate control of central squares"""
        center_squares = [chess.E4, chess.D4, chess.E5, chess.D5]
        control = {'white': 0, 'black': 0}
        
        for square in center_squares:
            if board.is_attacked_by(chess.WHITE, square):
                control['white'] += 1
            if board.is_attacked_by(chess.BLACK, square):
                control['black'] += 1
        
        return control
    
    def _evaluate_piece_activity(self, board):
        """Evaluate piece activity and development"""
        activity = {
            'white_developed': len([p for p in board.pieces(chess.KNIGHT, chess.WHITE) if p > chess.H2]),
            'black_developed': len([p for p in board.pieces(chess.KNIGHT, chess.BLACK) if p < chess.H7])
        }
        return activity
    
    def _evaluate_pawn_structure(self, board):
        """Evaluate pawn structure"""
        # Basic pawn structure analysis
        white_pawns = board.pieces(chess.PAWN, chess.WHITE)
        black_pawns = board.pieces(chess.PAWN, chess.BLACK)
        
        return {
            'white_pawns': len(white_pawns),
            'black_pawns': len(black_pawns),
            'isolated_pawns': self._count_isolated_pawns(board)
        }
    
    def _evaluate_king_safety(self, board):
        """Evaluate king safety"""
        # Basic king safety evaluation
        white_king = board.king(chess.WHITE)
        black_king = board.king(chess.BLACK)
        
        return {
            'white_king_safety': len(list(board.attackers(chess.BLACK, white_king))),
            'black_king_safety': len(list(board.attackers(chess.WHITE, black_king)))
        }
    
    def _count_isolated_pawns(self, board):
        """Count isolated pawns"""
        isolated = 0
        for color in [chess.WHITE, chess.BLACK]:
            pawns = board.pieces(chess.PAWN, color)
            for pawn in pawns:
                file = chess.square_file(pawn)
                has_adjacent = False
                for adj_file in [file - 1, file + 1]:
                    if 0 <= adj_file <= 7:
                        if any(p for p in pawns if chess.square_file(p) == adj_file):
                            has_adjacent = True
                            break
                if not has_adjacent:
                    isolated += 1
        return isolated
    
    def _get_suggested_improvements(self, analysis):
        """Generate suggested improvements based on analysis"""
        improvements = []
        eval_type = analysis['evaluation']['type']
        eval_value = analysis['evaluation']['value']
        
        if eval_type == 'cp':
            if abs(eval_value) > 200:
                improvements.append("Consider simplifying the position")
            elif abs(eval_value) > 100:
                improvements.append("Look for tactical opportunities")
        
        return improvements
    
    def _generate_learning_points(self, analysis):
        """Generate specific learning points from the analysis"""
        learning_points = []
        # Ensure analysis and best_moves exist and are not empty
        if not analysis or 'best_moves' not in analysis or not analysis['best_moves']:
            return learning_points
        
        best_moves = analysis['best_moves']
        top_move = best_moves[0]
        
        # Safely access Centipawn, default to None if missing
        top_cp = top_move.get('Centipawn') 
        top_mate = top_move.get('Mate')

        eval_str = f"(Mate in {top_mate})" if top_mate is not None else f"({top_cp/100.0:.2f})" if top_cp is not None else "(N/A)"
        learning_points.append(f"Best move: {top_move.get('Move', 'N/A')} {eval_str}")
        
        if len(best_moves) > 1:
            second_best = best_moves[1]
            second_cp = second_best.get('Centipawn')
            
            # Check if both centipawn values are integers before subtracting
            if isinstance(top_cp, int) and isinstance(second_cp, int):
                if abs(top_cp - second_cp) < 50:
                    learning_points.append("Multiple good moves available - consider strategic plans")
            else:
                # Handle cases where one or both moves are mates (CP is None)
                # You could add logic here, e.g., comparing mate scores if both are mates
                pass # For now, just skip the comparison if CP values aren't comparable
            
        return learning_points 