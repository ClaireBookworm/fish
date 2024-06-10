const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

card_deck = ["2H", "3H", "4H", "5H", "6H", "7H", "8H", "9H", "10H", "JH", "QH", "KH", "AH", "2D", "3D", "4D", "5D", "6D", "7D", "8D", "9D", "10D", "JD", "QD", "KD", "AD", "2C", "3C", "4C", "5C", "6C", "7C", "8C", "9C", "10C", "JC", "QC", "KC", "AC", "2S", "3S", "4S", "5S", "6S", "7S", "8S", "9S", "10S", "JS", "QS", "KS", "AS", "BJ", "RJ"]

suits = {"H": "Hearts", "D": "Diamonds", "C": "Clubs", "S": "Spades"}
half_suits = {
	"upper-hearts" : ["9H", "10H", "JH", "QH", "KH", "AH"],
	"upper-diamonds" : ["9D", "10D", "JD", "QD", "KD", "AD"],
	"upper-clubs" : ["9C", "10C", "JC", "QC", "KC", "AC"],
	"upper-spades" : ["9S", "10S", "JS", "QS", "KS", "AS"],
	"lower-hearts" : ["2H", "3H", "4H", "5H", "6H", "7H"],
	"lower-diamonds" : ["2D", "3D", "4D", "5D", "6D", "7D"],
	"lower-clubs" : ["2C", "3C", "4C", "5C", "6C", "7C"],
	"lower-spades" : ["2S", "3S", "4S", "5S", "6S", "7S"],
	"eights" : ["8H", "8D", "8C", "8S", "BJ", "RJ"]
}

function shuffleAndSplit(list) {
    // Shuffle the list
    for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
    }

    // Split the list into 6 sublists
    const sublistSize = Math.ceil(list.length / 6);
    const sublists = [];
    for (let i = 0; i < list.length; i += sublistSize) {
        sublists.push(list.slice(i, i + sublistSize));
    }
    return sublists;
}

let gameState = {
    players: {},
    teams: [[], []], // Two teams
    deck: [],
    suits: {},
    currentTurn: null,
};

// Initialize deck
const initializeDeck = () => {
    const suits = ['spades', 'hearts', 'diamonds', 'clubs'];
    const ranks = [2, 3, 4, 5, 6, 7, 9, 10, 'J', 'Q', 'K', 'A'];
    gameState.deck = [];
    suits.forEach(suit => {
        ranks.forEach(rank => {
            gameState.deck.push({ suit, rank });
        });
    });
    // Shuffle deck
    gameState.deck.sort(() => Math.random() - 0.5);
    gameState.suits = {
        low_spades: [],
        high_spades: [],
        low_hearts: [],
        high_hearts: [],
        low_diamonds: [],
		high_diamonds: [],
		low_clubs: [],
		high_clubs: [],
		eights: []
    };
};

const addPlayer = (socketId, name, team) => {
	console.log(socketId)
    gameState.players[socketId] = { id: socketId, name, team, hand: [] };
    gameState.teams[team].push(socketId);
};

// Deal cards
const dealCards = () => {
    const numPlayers = Object.keys(gameState.players).length;
    const cardsPerPlayer = gameState.deck.length / numPlayers;
    let cardIndex = 0;

    Object.values(gameState.players).forEach(player => {
        player.hand = gameState.deck.slice(cardIndex, cardIndex + cardsPerPlayer);
        cardIndex += cardsPerPlayer;
    });
    gameState.currentTurn = Object.keys(gameState.players)[0]; // Start with the first player
};

// let gameState = {
// 	// players 1-3 are team 1, players 4-6 are team 2
// 	players: [ [], [], [], [], [], [] ], // names
// 	player_states: [ [], [], [], [], [], [] ],
//     team_1_suits: [],
// 	team_2_suits: [],
// 	deck: [] // cards that are in play 
// };

// const initializeDeck = () => {
// 	const shuffled = shuffleAndSplit(card_deck); 
//     for (let p = 0; p < 6; p += 1) {
// 		gameState.player_states[p] = shuffled[p];	
// 	}
//     gameState.deck = card_deck;
// };

// Function to handle player actions
const handlePlayerAction = (playerId, action) => {
    const player = gameState.players[playerId];
    switch (action.type) {
        case 'ASK_CARD':
            askCard(player, action.card, action.opponentId);
            break;
        case 'DECLARE_SUIT':
            declareSuit(player, action.suit);
            break;
        // Add more cases for different actions
    }
};

const askCard = (player, card, opponentId) => {
    const opponent = gameState.players[opponentId];
    const cardIndex = opponent.hand.indexOf(card);
    if (cardIndex !== -1) {
        player.hand.push(opponent.hand.splice(cardIndex, 1)[0]);
        io.to(player.id).emit('UPDATE_HAND', player.hand);
        io.to(opponent.id).emit('UPDATE_HAND', opponent.hand);
        // Player gets another turn
    } else {
        gameState.currentTurn = opponentId;
        io.emit('TURN_UPDATE', gameState.currentTurn);
    }
};

const declareSuit = (player, suit) => {
    const suitCards = gameState.suits[suit];
    const team = gameState.teams[player.team];
    let allCardsHeld = true;

    suitCards.forEach(card => {
        if (!team.some(teammateId => gameState.players[teammateId].hand.includes(card))) {
            allCardsHeld = false;
        }
    });

    if (allCardsHeld) {
        io.emit('SUIT_DECLARED', { suit, team: player.team });
        // Remove claimed cards from players' hands
        team.forEach(teammateId => {
            const playerHand = gameState.players[teammateId].hand;
            gameState.players[teammateId].hand = playerHand.filter(card => !suitCards.includes(card));
        });
    } else {
		// Penalize team
		const opposingTeam = gameState.teams[player.team === 0 ? 1 : 0];
		opposingTeam.forEach(teammateId => {
			const teammate = gameState.players[teammateId];
			teammate.hand = teammate.hand.concat(gameState.suits[suit]);
		});
		gameState.suits[suit] = [];
	}
};

io.on('connection', (socket) => {
    console.log('New client connected', socket.id);

    socket.on('JOIN_GAME', (name, team) => {
        addPlayer(socket.id, name, team);
		console.log(name + " joined team " + team)
        if (Object.keys(gameState.players).length === 6 || Object.keys(gameState.players).length === 8) {
            initializeDeck();
            dealCards();
            io.emit('GAME_START', gameState);
        }
    });

    socket.on('PLAYER_ACTION', (action) => {
        handlePlayerAction(socket.id, action);
    });

    socket.on('disconnect', () => {
        delete gameState.players[socket.id];
        gameState.teams.forEach(team => {
            const index = team.indexOf(socket.id);
            if (index !== -1) team.splice(index, 1);
        });
        console.log('Client disconnected', socket.id);
    });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));