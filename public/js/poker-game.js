// Plik: public/js/poker-game.js

document.addEventListener('DOMContentLoaded', async function() {
    // Weryfikacja tokenu i sprawdzenie logowania
    const isValid = await verifyToken();
    
    if (!isValid || !isAuthenticated()) {
        // Jeśli token jest nieprawidłowy lub użytkownik nie jest zalogowany, przekieruj na stronę logowania
        window.location.href = '/login.html';
        return;
    }
    
    // Pobierz parametry z URL
    const urlParams = new URLSearchParams(window.location.search);
    const tableId = urlParams.get('table');
    const position = urlParams.get('position');
    
    if (!tableId || !position) {
        alert('Nieprawidłowe parametry stołu');
        window.location.href = '/games/poker-lobby.html';
        return;
    }
    
    // Pobierz dane użytkownika
    const userData = await updateUserData() || getUser();
    
    // Zaktualizuj UI
    document.getElementById('username').textContent = userData.username;
    document.getElementById('user-points').textContent = userData.points + ' punktów';
    
    // Inicjalizacja stołu pokerowego
    initPokerTable(tableId, position);
    
    // Obsługa wylogowania
    document.getElementById('logout-btn').addEventListener('click', function() {
        logout();
        window.location.href = '/index.html';
    });
    
    // Obsługa przycisków akcji
    document.getElementById('fold-btn').addEventListener('click', function() {
        performAction('fold');
    });
    
    document.getElementById('check-btn').addEventListener('click', function() {
        performAction('check');
    });
    
    document.getElementById('call-btn').addEventListener('click', function() {
        performAction('call');
    });
    
    document.getElementById('raise-btn').addEventListener('click', function() {
        document.getElementById('raise-controls').style.display = 'flex';
        document.getElementById('raise-btn').style.display = 'none';
    });
    
    document.getElementById('confirm-raise-btn').addEventListener('click', function() {
        const amount = parseInt(document.getElementById('raise-amount').value);
        performAction('raise', amount);
        document.getElementById('raise-controls').style.display = 'none';
        document.getElementById('raise-btn').style.display = 'inline-block';
    });
    
    document.getElementById('cancel-raise-btn').addEventListener('click', function() {
        document.getElementById('raise-controls').style.display = 'none';
        document.getElementById('raise-btn').style.display = 'inline-block';
    });
    
    // Synchronizacja slidera i pola liczbowego dla raise
    const raiseSlider = document.getElementById('raise-slider');
    const raiseAmount = document.getElementById('raise-amount');
    
    raiseSlider.addEventListener('input', function() {
        raiseAmount.value = raiseSlider.value;
    });
    
    raiseAmount.addEventListener('input', function() {
        raiseSlider.value = raiseAmount.value;
    });
    
    // Obsługa chatu
    document.getElementById('send-message-btn').addEventListener('click', sendChatMessage);
    document.getElementById('chat-input-field').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            sendChatMessage();
        }
    });
});


// Poprawiona funkcja initPokerTable
async function initPokerTable(tableId, position) {
    try {
        // Pobierz dane stołu
        const response = await fetchWithAuth(`http://localhost:5000/api/tables/poker/${tableId}`);
        if (!response.ok) {
            throw new Error('Nie można pobrać danych stołu');
        }
        
        const tableData = await response.json();
        
        // Aktualizuj informacje o stole
        document.getElementById('table-name').textContent = tableData.nazwa;
        document.getElementById('small-blind').textContent = tableData.maly_blind;
        document.getElementById('big-blind').textContent = tableData.duzy_blind;
        
        // Pobierz maksymalną liczbę graczy i dostosuj układ stołu
        const maxPlayers = tableData.max_graczy || 9;
        arrangeSeats(maxPlayers);
        
        // Pobierz graczy przy stole
        const playersResponse = await fetch(`http://localhost:5000/api/tables/poker/${tableId}/players`);
        if (!playersResponse.ok) {
            throw new Error('Nie można pobrać danych graczy');
        }
        
        const playersData = await playersResponse.json();
        console.log("Pobrani gracze:", playersData);
        
        // Wyświetl graczy na stole
        displayPlayers(playersData, position);
        
        // Rozpocznij nasłuchiwanie aktualizacji stanu gry przez WebSocket
        connectToGameSocket(tableId, position);
        
    } catch (error) {
        console.error('Błąd inicjalizacji stołu:', error);
        alert('Wystąpił błąd podczas ładowania stołu. Spróbuj ponownie.');
    }
}

// Wyświetlanie graczy na stole
// Poprawiona funkcja displayPlayers z dostosowaniem do faktycznych kluczy danych
function displayPlayers(players, myPosition) {
    // Najpierw czyścimy wszystkie miejsca
    for (let i = 1; i <= 9; i++) {
        const seat = document.getElementById(`seat-${i}`);
        if (seat) {
            seat.innerHTML = `
                <div class="player-info">
                    <div class="player-name">Wolne miejsce</div>
                    <div class="player-stack"></div>
                    <div class="player-bet"></div>
                </div>
                <div class="player-cards">
                    <div class="card card-back"></div>
                    <div class="card card-back"></div>
                </div>
            `;
            seat.classList.remove('active-player');
        }
    }
    
    // Teraz wypełniamy miejsca zajęte przez graczy
    players.forEach(player => {
        // Używamy position zamiast pozycja_siedzenia
        const playerPosition = player.position || player.pozycja_siedzenia;
        const playerName = player.name || player.nazwa_uzytkownika;
        
        const seat = document.getElementById(`seat-${playerPosition}`);
        if (seat) {
            // Sprawdź czy to moje miejsce
            const isMe = parseInt(playerPosition) === parseInt(myPosition);
            
            seat.innerHTML = `
                <div class="player-info">
                    <div class="player-name">${playerName}${isMe ? ' (Ty)' : ''}</div>
                    <div class="player-stack">${player.stack || 1000} żetonów</div>
                    <div class="player-bet">${player.bet > 0 ? player.bet : ''}</div>
                </div>
                <div class="player-cards">
                    <div class="card ${isMe && player.cards ? 'card-front' : 'card-back'}" id="card1-seat-${playerPosition}"></div>
                    <div class="card ${isMe && player.cards ? 'card-front' : 'card-back'}" id="card2-seat-${playerPosition}"></div>
                </div>
            `;
            
            // Jeśli to moje miejsce i mam karty, pokaż je
            if (isMe && player.cards) {
                const card1 = document.getElementById(`card1-seat-${playerPosition}`);
                const card2 = document.getElementById(`card2-seat-${playerPosition}`);
                
                if (card1 && card2) {
                    renderCard(card1, player.cards[0]);
                    renderCard(card2, player.cards[1]);
                }
            }
            
            // Jeśli gracz jest aktywny, dodaj klasę
            if (player.active) {
                seat.classList.add('active-player');
            }
        }
    });
    
    console.log("Gracze po przetworzeniu:", players);
}
// Renderowanie karty
function renderCard(element, card) {
    if (!card) return;
    
    const suit = card.slice(-1);
    const value = card.slice(0, -1);
    
    // Przypisz kolor w zależności od koloru karty
    const color = (suit === 'h' || suit === 'd') ? 'red' : 'black';
    
    // Mapowanie kształtu
    const suitSymbol = {
        'h': '♥',
        'd': '♦',
        'c': '♣',
        's': '♠'
    }[suit];
    
    // Mapowanie wartości
    const valueDisplay = {
        'A': 'A',
        'K': 'K',
        'Q': 'Q',
        'J': 'J',
        '10': '10',
        '9': '9',
        '8': '8',
        '7': '7',
        '6': '6',
        '5': '5',
        '4': '4',
        '3': '3',
        '2': '2'
    }[value];
    
    element.innerHTML = `
        <div class="card-value" style="color: ${color}">${valueDisplay}</div>
        <div class="card-suit" style="color: ${color}">${suitSymbol}</div>
    `;
    element.classList.remove('card-back');
    element.classList.add('card-front');
}

// Połączenie z WebSocket do aktualizacji stanu gry
function connectToGameSocket(tableId, position) {
    // Utwórz połączenie WebSocket
    const token = getAuthToken();
    const socket = new WebSocket(`ws://localhost:5001/game?tableId=${tableId}&position=${position}&token=${token}`);
    
    socket.onopen = function() {
        console.log('Połączono z serwerem gry');
    };
    
    socket.onmessage = function(event) {
        const data = JSON.parse(event.data);
        
        // Obsługa różnych typów wiadomości
        switch (data.type) {
            case 'gameState':
                updateGameState(data.payload);
                break;
            case 'playerTurn':
                handlePlayerTurn(data.payload);
                break;
            case 'handResult':
                showHandResult(data.payload);
                break;
            case 'chat':
                addChatMessage(data.payload);
                break;
        }
    };
    
    socket.onclose = function() {
        console.log('Rozłączono z serwerem gry');
    };
    
    // Zapisz socket globalnie, aby móc go używać w innych funkcjach
    window.gameSocket = socket;
}

// Aktualizacja stanu gry
function updateGameState(state) {
    // Aktualizuj pulę
    document.getElementById('pot').textContent = state.pot;
    
    // Aktualizuj karty na stole
    if (state.communityCards) {
        // Flop
        if (state.communityCards.length >= 3) {
            renderCard(document.getElementById('flop-1'), state.communityCards[0]);
            renderCard(document.getElementById('flop-2'), state.communityCards[1]);
            renderCard(document.getElementById('flop-3'), state.communityCards[2]);
        }
        
        // Turn
        if (state.communityCards.length >= 4) {
            renderCard(document.getElementById('turn'), state.communityCards[3]);
        }
        
        // River
        if (state.communityCards.length >= 5) {
            renderCard(document.getElementById('river'), state.communityCards[4]);
        }
    }
    
    // Aktualizuj graczy
    displayPlayers(state.players, state.myPosition);
}

// Obsługa tury gracza
function handlePlayerTurn(turnData) {
    // Jeśli to nasza tura, aktywuj przyciski
    if (turnData.isMyTurn) {
        // Aktywuj odpowiednie przyciski w zależności od dozwolonych akcji
        document.getElementById('fold-btn').disabled = !turnData.actions.includes('fold');
        document.getElementById('check-btn').disabled = !turnData.actions.includes('check');
        document.getElementById('call-btn').disabled = !turnData.actions.includes('call');
        document.getElementById('raise-btn').disabled = !turnData.actions.includes('raise');
        
        // Aktualizuj wysokość call
        if (turnData.callAmount) {
            document.getElementById('call-amount').textContent = turnData.callAmount;
        }
        
        // Aktualizuj slider dla raise
        if (turnData.minRaise && turnData.maxRaise) {
            const raiseSlider = document.getElementById('raise-slider');
            const raiseAmount = document.getElementById('raise-amount');
            
            raiseSlider.min = turnData.minRaise;
            raiseSlider.max = turnData.maxRaise;
            raiseSlider.value = turnData.minRaise;
            
            raiseAmount.min = turnData.minRaise;
            raiseAmount.max = turnData.maxRaise;
            raiseAmount.value = turnData.minRaise;
        }
    } else {
        // Wyłącz przyciski, jeśli to nie nasza tura
        document.getElementById('fold-btn').disabled = true;
        document.getElementById('check-btn').disabled = true;
        document.getElementById('call-btn').disabled = true;
        document.getElementById('raise-btn').disabled = true;
    }
}

// Wykonanie akcji
function performAction(action, amount = null) {
    if (!window.gameSocket) return;
    
    const data = {
        action,
        amount
    };
    
    window.gameSocket.send(JSON.stringify({
        type: 'action',
        payload: data
    }));
}

// Wyświetlenie wyniku rozdania
function showHandResult(result) {
    // Tymczasowo po prostu wyświetl alert
    let message = 'Wynik rozdania:\n';
    
    result.players.forEach(player => {
        message += `${player.name}: ${player.handName}${player.winner ? ' (Wygrana: ' + player.winAmount + ')' : ''}\n`;
    });
    
    alert(message);
}

// Dodanie wiadomości do chatu
function addChatMessage(message) {
    const chatMessages = document.getElementById('chat-messages');
    
    const messageElement = document.createElement('div');
    messageElement.classList.add('chat-message');
    
    if (message.system) {
        messageElement.classList.add('system-message');
        messageElement.textContent = message.text;
    } else {
        messageElement.innerHTML = `<strong>${message.sender}:</strong> ${message.text}`;
    }
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}
function arrangeSeats(maxPlayers) {
    console.log(`Ustawianie miejsc dla ${maxPlayers} graczy`);
    
    // Najpierw ukryj wszystkie miejsca
    for (let i = 1; i <= 9; i++) {
        const seat = document.getElementById(`seat-${i}`);
        if (seat) {
            seat.style.display = 'none';
            // Resetujemy wszystkie style pozycji aby uniknąć konfliktów
            seat.style.left = 'auto';
            seat.style.right = 'auto';
            seat.style.top = 'auto';
            seat.style.bottom = 'auto';
            seat.style.transform = 'none';
        }
    }
    
    // Ustal położenia dla określonej liczby graczy
    const positions = calculateSeatPositions(maxPlayers);
    console.log('Obliczone pozycje:', positions);
    
    // Przypisz pozycje do miejsc
    for (let i = 0; i < maxPlayers; i++) {
        const seatNumber = i + 1;
        const seat = document.getElementById(`seat-${seatNumber}`);
        if (seat && positions[i]) {
            // Ustaw style dla miejsca
            seat.style.display = 'flex';
            
            if (positions[i].left !== undefined) seat.style.left = positions[i].left;
            if (positions[i].right !== undefined) seat.style.right = positions[i].right;
            if (positions[i].top !== undefined) seat.style.top = positions[i].top;
            if (positions[i].bottom !== undefined) seat.style.bottom = positions[i].bottom;
            
            // Zastosuj transformacje jeśli są zdefiniowane
            if (positions[i].transform) {
                seat.style.transform = positions[i].transform;
            }
            
            console.log(`Ustawiono miejsce #${seatNumber}:`, positions[i]);
        }
    }
}

// Funkcja obliczająca pozycje miejsc
function calculateSeatPositions(maxPlayers) {
    const positions = [];
    
    switch (maxPlayers) {
        case 2:
            // Dla 2 graczy - jeden na dole, jeden na górze
            positions.push(
                { bottom: '50px', left: '50%', transform: 'translateX(-50%)' },
                { top: '50px', left: '50%', transform: 'translateX(-50%)' }
            );
            break;
            
        case 4:
            // Dla 4 graczy - po jednym z każdej strony
            positions.push(
                { bottom: '50px', left: '50%', transform: 'translateX(-50%)' },
                { left: '50px', top: '50%', transform: 'translateY(-50%)' },
                { top: '50px', left: '50%', transform: 'translateX(-50%)' },
                { right: '50px', top: '50%', transform: 'translateY(-50%)' }
            );
            break;
            
        case 6:
            // Dla 6 graczy - zupełnie nowa konfiguracja z większymi odstępami
            positions.push(
                { bottom: '50px', left: '25%' },                // Lewy dolny
                { bottom: '50px', right: '25%' },               // Prawy dolny
                { left: '50px', top: '30%' },                   // Lewy środkowy
                { right: '50px', top: '30%' },                  // Prawy środkowy
                { top: '50px', left: '25%' },                   // Lewy górny
                { top: '50px', right: '25%' }                   // Prawy górny
            );
            break;
            
        case 8:
            // Dla 8 graczy - bardziej rozłożone pozycje
            positions.push(
                { bottom: '50px', left: '20%' },
                { bottom: '50px', left: '50%', transform: 'translateX(-50%)' },
                { bottom: '50px', right: '20%' },
                { left: '50px', top: '35%' },
                { right: '50px', top: '35%' },
                { top: '50px', left: '20%' },
                { top: '50px', left: '50%', transform: 'translateX(-50%)' },
                { top: '50px', right: '20%' }
            );
            break;
            
        case 9:
        default:
            // Dla 9 graczy - standardowy układ z większymi odstępami
            positions.push(
                { bottom: '50px', left: '50%', transform: 'translateX(-50%)' },
                { bottom: '80px', left: '20%' },
                { bottom: '120px', left: '5%' },
                { left: '50px', top: '50%', transform: 'translateY(-50%)' },
                { top: '120px', left: '5%' },
                { top: '80px', left: '20%' },
                { top: '50px', left: '50%', transform: 'translateX(-50%)' },
                { top: '80px', right: '20%' },
                { top: '120px', right: '5%' }
            );
            break;
    }
    
    return positions;
}
// Wysłanie wiadomości na chat
function sendChatMessage() {
    const input = document.getElementById('chat-input-field');
    const message = input.value.trim();
    
    if (!message || !window.gameSocket) return;
    
    window.gameSocket.send(JSON.stringify({
        type: 'chat',
        payload: {
            text: message
        }
    }));
    
    input.value = '';
}