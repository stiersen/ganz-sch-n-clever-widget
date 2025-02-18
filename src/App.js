import React, { Component } from "react";
import { WidgetApiToWidgetAction } from 'matrix-widget-api'
import {
    ST_PETERSBURG_EVENT_NAME,
} from './main'
import { GameState, Player, TurnType } from './gameState'
import GameField, { Card } from './gameField'
import { StartGamePage } from "./StartGamePage"
import "./App.css"
import "./DeckSelector.css"
import "./PubActivationSelector.css"
import "./loader.css"
import { deepEqual } from './helper'
import { CardCategory } from "./cards";
import { StPetersburgContext } from "./context";
import { getHttpUriForMxc } from "./mxcToHttp"

const stringHash = require("string-hash");

const NOTIFY = true;
const LOGGING = false;
const SHOW_TURNS = false;
class App extends Component {
    constructor(props) {
        super(props);
        this.widgetApi = props.widgetApi;
        this.userId = props.userId;
        this.prev_gameState = null;
        this.startState = null;
        window.Actions = {
            selectCard: this.selectCard.bind(this),
            selectDeck: this.selectDeck.bind(this),
            selectActionTypeForCard: this.selectActionTypeForCard.bind(this),
            selectCard: this.selectCard.bind(this),
            selectPubActivationCount: this.selectPubActivationCount.bind(this),
            setAppState: (newState) => { this.setState(newState) },
            toggleSetting: (setting) => {
                let newState = {}
                newState[setting] = !this.state[setting];
                this.setState(newState)
            }
        }
        this.state = {
            roomMembers: {},
            selectedRoomMember: new Set(),
            gameState: new GameState(),
            yourTurn: false,
            lockUI: false,
            gameStateHistory: undefined,
            showGameStateHistory: false,
            gameStateHistoryIndex: 0,
            cardSelector: undefined,
            deckSelector: undefined,
            actionTypeSelector: undefined,
            // trashSelector: undefied,
            pubSelector: undefined,
            SHOW_CARD_ID: false,
        };
    }
    test = 10;
    componentDidMount() {
        this.widgetApi.on(`action:${WidgetApiToWidgetAction.SendEvent}`, (ev) => {
            switch (ev.detail.data.type) {
                case "m.room.message":
                    ev.preventDefault();
                    this.widgetApi.transport.reply(ev.detail, {});
                    break;
                case ST_PETERSBURG_EVENT_NAME:
                    ev.preventDefault();
                    this.widgetApi.transport.reply(ev.detail, {});
                    console.log("ST_PETERSBURG_EVENT: ", ev)
                    // TODO always keep track of the previous event to than check if the turn was valid. 
                    // otherwise give the player form that turn the option to reset to that state.
                    // this is the only next event that is accepted by other clients
                    // this.state.previousEvent = ev.detail.data.unsigned.prev_content
                    // this.prev_gameState = App.cloneGameState(this.state.gameState);
                    if (ev.detail.data.state_key == this.props.widgetId) {
                        this.handleStPetersburgEvent(ev.detail.data)
                    } else {
                        console.log("ignore stPetersburg events form other widgets in this room")
                    }
                    break;
            }

        })
        this.widgetApi.readStateEvents(
            "m.room.member",
            100,
        ).then((events) => {
            let roomMembers = events.map(ev => ({
                matrixId: ev.state_key,
                avatar_url: getHttpUriForMxc("https://matrix-client.matrix.org", ev.content.avatar_url, 40, 40, "scale"),
                displayname: ev.content.displayname,
                membership: ev.content.membership,
            })).filter(
                (member)=>(member.membership == "join")
            ).reduce(
                (obj, member) => {obj[member.matrixId] = member; return obj},
                {}
            );
            console.log('read member: ', roomMembers)
            this.setState({
                selectedRoomMember: new Set(Object.keys(roomMembers)),
                roomMembers: roomMembers,
            })
        });
        this.widgetApi.readStateEvents(
            ST_PETERSBURG_EVENT_NAME,
            25,
        ).then((events) => {
            let stPetersEvent = events.filter(
                ev => ev.state_key == this.props.widgetId
            )[0];
            console.log('read st events: ', stPetersEvent)
            this.handleStPetersburgEvent(stPetersEvent)
        });
    }

    sendStPetersburgEvent(gameState, hashFromPrevState, startState) {
        this.setState({
            lockUI: true,
        })
        let content = { "gameState": gameState.getSendObj(), "hash": hashFromPrevState, "startState": startState?.getSendObj() }
        let roomMessageContent = {
            "msgtype": "m.text",
            "body": "# hallo\n_test_",
            "format": "org.matrix.custom.html",
            "formatted_body": "<h3>St. Petersburg Event</h3>\n<p>Turn:</p>\n<pre><code class=\"language-json\">" + JSON.stringify(gameState.turns.last, null, "\t") + "\n</code></pre>\n<p>GameState:</p>\n<pre><code class=\"language-json\">" + JSON.stringify(gameState, null, "\t") + "\n</code></pre>\n"
        }
        let roomNotifyContent = {
            "msgtype": "m.text",
            "body": "🕍 " + gameState.getCurrentPlayer().matrixId + " It's your turn!\n_Sent from the St. Petersburg Widget_",
            "format": "org.matrix.custom.html",
            "formatted_body": "🕍 <a href=\"https://matrix.to/#/" + gameState.getCurrentPlayer().matrixId + "\">" + gameState.getCurrentPlayer().matrixId + "</a> It's your turn!<br><em>Sent from the St. Petersburg Widget</em>"
        }
        if (gameState.isPlayedToEnd) {
            let summary = GameState.gameSummary(startState, gameState.turns)
            let summaryPlayerTextList = summary.playerSummaries.map((p, i) =>
                "<strong>" + (i + 1) + ". Place <a href=\"https://matrix.to/#/" + summary.playerSummaries[i].matrixId + "\">" + summary.playerSummaries[i].matrixId + "</a></strong>\n" +
                "<p>with <strong>" + p.points + "</strong> points:</p>\n" +
                "<ul>" +
                "<li><strong>Final settlement:</strong>\n" +
                "<ul>" +
                "<li>Aristocrats (" + p.countFinalAristocrats + "): " + p.pointsFinalAristocrats + " Point/s</li>" +
                "<li>Rubel (" + p.money + "): " + p.pointsFromMoney + " Point/s</li>" +
                "<li>Hand Cards (" + p.countFinalHandCards + "): " + p.pointsFinalHandCards + " Point/s</li>" +
                "</ul>" +
                "</li>\n" +
                "<li><strong>Worker</strong>: " + p.pointsWorker + " Point/s</li>\n" +
                "<li><strong>Buildings</strong>: " + p.pointsBuildings + " Point/s</li>\n" +
                "<li><strong>Aristocrats</strong>: " + p.pointsAristocrats + " Point/s</li>" +
                "</ul>")
            roomNotifyContent = {
                "msgtype": "m.text",
                "body": "🕍 " + gameState.getCurrentPlayer().matrixId + " It's your turn!\n_Sent from the St. Petersburg Widget_",
                "format": "org.matrix.custom.html",
                "formatted_body":
                    "🕍 The Game is Over:<br>" +
                    "Congratulations to <a href=\"https://matrix.to/#/" + summary.playerSummaries[0].matrixId + "\">" + summary.playerSummaries[0].matrixId + "</a>, who <strong>won the game.</strong> 🎉<br><br>" +
                    summaryPlayerTextList.join("") +
                    "<br><em>Sent from the St. Petersburg Widget</em>"
            }
        }
        this.widgetApi.sendStateEvent(ST_PETERSBURG_EVENT_NAME, this.props.widgetId, content);
        if (LOGGING) this.widgetApi.sendRoomEvent("m.room.message", roomMessageContent, "");
        if (NOTIFY) this.widgetApi.sendRoomEvent("m.room.message", roomNotifyContent, "");
    }
    sendCheatAlert(cheatMessages, sender) {
        let cheatErrorList = cheatMessages.map(err => "\n" + err.msg + "\n" + err.details)
        let cheatErrorListFormatted = cheatMessages.map(err => "<br><strong>" + err.msg + "</strong><br><em>" + err.details + "</em>")
        let roomCheatAlert = {
            "msgtype": "m.text",
            "body": "🕍 I think, that " + sender + " cheated!<br>Those are my suspicions:<br>" + cheatErrorList + "\n_Sent from the St. Petersburg Widget_",
            "format": "org.matrix.custom.html",
            "formatted_body": "🕍 I think, that " + sender + " cheated!<br>Those are my suspicions:<br>" + cheatErrorListFormatted + "<br><em>Sent from the St. Petersburg Widget</em>",
        }
        this.widgetApi.sendRoomEvent("m.room.message", roomCheatAlert, "");
    }
    initializeGame() {
        let gameState = new GameState(Array.from(this.state.selectedRoomMember));
        this.sendStPetersburgEvent(gameState, gameState.getHash(), gameState);
    }
    endGame() {
        // if (confirm('Are you sure you want to end the game for all participaing players?')) {
        this.state.gameState.isGameOver = true;
        this.sendStPetersburgEvent(this.state.gameState, null, this.startState);
        // }
    }

    makeTurn(turn) {
        // the turn type gets extended with a nextTurn: true field in next state after turn if the next phase is started
        let hash = this.state.gameState.getHash()
        this.state.gameState.nextStateAfterTurn(turn);
        this.sendStPetersburgEvent(this.state.gameState, hash, this.startState);
    }

    selectCard(optionCardIds) {
        let promise = new Promise((cardSelected) => {
            let cardSelector = {
                optionCardIds: optionCardIds,
                onSelect: (cardId) => {
                    cardSelected(cardId)
                    this.setState({
                        cardSelector: null,
                    })
                }
            }
            this.setState({
                cardSelector: cardSelector,
            })
        });
        return promise;
    }
    selectDeck() {
        let promise = new Promise((deckSelected) => {
            let deckSelector = {
                onSelect: (deckCategory) => {
                    deckSelected(deckCategory)
                    this.setState({
                        deckSelector: null,
                    })
                }
            }
            this.setState({
                deckSelector: deckSelector,
            })
        });
        return promise;
    }
    selectActionTypeForCard(cardId) {
        let promise = new Promise((actionTypeSelected) => {
            let actionTypeSelector = {
                cardId: cardId,
                onSelect: (actionType, _cardId) => {
                    actionTypeSelected(actionType);
                    this.setState({
                        actionTypeSelector: undefined,
                    })
                }
            }
            this.setState({
                actionTypeSelector: actionTypeSelector,
            })
        });
        return promise;
    }
    selectPubActivationCount(possibleActivations) {
        let promise = new Promise((pubSelected) => {
            let pubSelector = {
                possibleActivations: possibleActivations,
                onSelect: (activationCount) => {
                    pubSelected(activationCount)
                    this.setState({
                        pubSelector: null,
                    })
                }
            }
            this.setState({
                pubSelector: pubSelector,
            })
        });
        return promise;
    }

    static cloneGameState(gameStateA) {
        const copiedA = JSON.parse(JSON.stringify(gameStateA));
        let gameStateB = new GameState();
        Object.assign(gameStateB, copiedA);
        gameStateB.players = gameStateB.players.map((p) => {
            let pl = new Player();
            return Object.assign(pl, p);
        })
        return gameStateB;
    }
    handleStPetersburgEvent(evData) {
        let newGs = App.cloneGameState(evData.content.gameState);
        const startState = App.cloneGameState(evData.content.startState);
        // newGs.seed = // will be set accordingly depending on newGs.turns.length != 0
        newGs.sender = evData.sender;

        if (newGs.turns.length != 0 && !newGs.isGameOver) {
            // Do validation and track previous event
            if (evData.unsigned?.prev_content?.gameState) {
                // handle from "readEvent" callback
                this.prev_gameState = App.cloneGameState(evData.unsigned?.prev_content?.gameState)
                this.prev_gameState.sender = evData.unsigned?.prev_sender;
                this.prev_gameState.seed = evData.unsigned?.prev_content.hash;
            } else if (this.prev_gameState) {
                // handle from "on" callback
                let seed = this.prev_gameState.getHash();
                this.prev_gameState = App.cloneGameState(this.state.gameState);
                this.prev_gameState.sender = this.state.gameState.sender;
                this.prev_gameState.seed = seed;
            } else {
                console.error("There is no prev GameState so we calculate it from the history")
                let hist = GameState.createGameStateHistory(startState, newGs.turns);
                this.prev_gameState = App.cloneGameState(hist[hist.length - 2]);
                this.prev_gameState.sender = hist[hist.length - 3].getCurrentPlayer().matrixId;
                this.prev_gameState.seed = hist[hist.length - 3].getHash();
            }
            newGs.seed = this.prev_gameState.getHash();
            this.validateGameState(newGs, this.prev_gameState, startState, this.startState)
        } else if (newGs.turns.length == 0) {
            console.log("-----GAME-----INITIALIZED-----,\n not validating the state since it seems to be the initial event")
            newGs.seed = evData.content.hash; // getting the hash from the init event for the next round
        } else if (newGs.isGameOver) {
            console.log("-----GAME-----ENDED-----,\n not validating the state since the game is finished")
            // here we dont care about the seed
        }

        // HISTORY:
        let history;
        if (!this.state.gameStateHistory) {
            history = GameState.createGameStateHistory(startState, newGs.turns);
        } else {
            history = this.state.gameStateHistory.concat(App.cloneGameState(newGs));
        }

        this.startState = startState;
        this.setState({
            lockUI: false,
            gameState: newGs,//Object.assign(oldGs, newGsContent),
            yourTurn: newGs.getCurrentPlayer().matrixId == this.userId,
            gameStateHistory: history,
        });

    }
    validateGameState(gs, prev_gs, startState, previousStartState) {
        let cheatMessages = [];

        // check that start state was not altered:
        if (previousStartState) {
            if (startState.getHash() != previousStartState.getHash()) {
                cheatMessages.push({
                    msg: "A user changed the start state.",
                    details: "Changing the startState of the game makes it impossible reconstruct the game. As a consequence the history view wont work. And most likely someone cheated or there is a bug."
                })
            }
        } else {
            console.log("could not check start state, this is the first even received with this session so the prev start state could not be stored.")
        }
        // check that the correct player sended:
        let expected_sender = prev_gs.players.map(p => p.matrixId)[(prev_gs.currentPlayerIndex) % prev_gs.players.length]
        if (gs.sender != expected_sender) {
            cheatMessages.push({
                msg: "A user, who is not at turn, tried to update the state.",
                details: "The last turn was:" + prev_gs.sender + " which implies that " + expected_sender + " is now at turn, but then " + gs.sender + " sent the next turn."
            })
        }

        // check turns array:
        let temp1 = prev_gs.turns;
        let temp2 = gs.turns.slice(0, -1);
        if (!deepEqual(temp1, temp2)) {
            // if (prev_gs.turns != gs.turns.slice(0, -1)) {
            cheatMessages.push({
                msg: "The turn history from the previous state does not match",
                details: "Someone manually changed the turn history or added multiple turns to the end of the turn list."
            })
        }
        let newTurn = gs.turns.slice(-1)[0];
        prev_gs.nextStateAfterTurn(newTurn);
        console.log("compared Game States\nPrevious:\n", prev_gs.getSendObj(), "\nCurrent:", gs.getSendObj())
        if (prev_gs.getHash() != gs.getHash()) {
            cheatMessages.push({
                msg: "The sent state does not match the expected state.",
                details: "The turn applied to the previous state was: " + JSON.stringify(newTurn) + " and this does not result in the state sent by the sender"
            })
        }
        if (cheatMessages.length > 0) {
            console.log("AAARRRG cheater with errors: " + cheatMessages.map(err => "\nMESSAGE: " + err.msg + "\nDETAILS: " + err.details))
            this.sendCheatAlert(cheatMessages, gs.sender);
        } else {
            console.log("Great, this turn was done without cheating!! congratulation!")
        }
    }

    gameRunning() {
        return !this.state.gameState.isGameOver && this.state.gameState.players.length > 0;
    }

    playerChanged(member) {
        let newSet = new Set(this.state.selectedRoomMember)
        newSet.has(member)
            ? newSet.delete(member)
            : newSet.add(member);
        this.setState({
            selectedRoomMember: newSet
        })
    }
    toggleHistoryView(isInHistoryView) {
        console.log("gameStateHistory", this.state.gameStateHistory)
        if (isInHistoryView) {
            this.setState({
                showGameStateHistory: false,
            })
        } else {
            this.setState({
                gameStateHistoryIndex: Math.max(this.state.gameStateHistory.length - 1, 0),
                showGameStateHistory: true,
            })
        }
    }
    nextHistory() {
        const newIndex = this.state.gameStateHistoryIndex + 1;
        if (newIndex < this.state.gameStateHistory.length) {
            this.setState({ gameStateHistoryIndex: newIndex });
        }
    }
    prevHistory() {
        const newIndex = this.state.gameStateHistoryIndex - 1;
        if (newIndex >= 0) {
            this.setState({ gameStateHistoryIndex: newIndex });
        }
    }
    render() {
        console.log("current gameState: ", this.state.gameState);
        console.log("current is startGame: ", this.state.gameState == {});
        console.log("current game is cancelled: ", this.state.gameState.isCancelled());
        console.log("current game is played to the end: ", this.state.gameState.isPlayedToEnd);
        let startGamePage = <StartGamePage
            gameState={this.state.gameState}
            initializeGame={this.initializeGame.bind(this)}
            selectedRoomMember={this.state.selectedRoomMember}
            onPlayerChanged={this.playerChanged.bind(this)}
            roomMembers={this.state.roomMembers}
        />
        let game;
        if (this.gameRunning()) {
            let gs = this.state.showGameStateHistory ? this.state.gameStateHistory[this.state.gameStateHistoryIndex] : this.state.gameState
            game =
                <div>
                    <div>
                        <GameHeader phase={gs.phase} cards={gs.cards} /><div className="version">version {process.env.PACKAGE_VERSION}</div>
                    </div>
                    {!this.state.showGameStateHistory &&
                        <GameField
                            history={this.state.gameStateHistory}
                            gameState={gs}
                            onTurn={this.makeTurn.bind(this)}
                            userId={this.userId}
                            cardSelector={this.state.cardSelector}
                            onPass={this.makeTurn.bind(this, { type: TurnType.Pass })}
                            onEnd={this.endGame.bind(this)}
                            gameStateHistory={this.state.gameStateHistory}
                            showGameStateHistory={false}
                            onHistoryToggle={this.toggleHistoryView.bind(this, this.state.showGameStateHistory)}
                            showCardIds={this.state.SHOW_CARD_ID}
                        />
                    }
                    {this.state.showGameStateHistory &&
                        <>
                            <div style={{ display: "flex", flexDirection: "row" }}>
                                <button disabled={this.state.gameStateHistoryIndex <= 0} style={{ flexGrow: 1 }} onClick={this.prevHistory.bind(this)}>{"< Prev"}</button>
                                <button disabled={this.state.gameStateHistoryIndex >= this.state.gameStateHistory.length - 1} style={{ flexGrow: 1 }} onClick={this.nextHistory.bind(this)}>{"Next >"}</button>
                            </div>
                            <GameField
                                gameState={gs}
                                userId={this.userId}
                                showGameStateHistory={true}
                                gameStateHistory={this.state.gameStateHistory.slice(0, this.state.gameStateHistoryIndex + 1)}
                                onHistoryToggle={this.toggleHistoryView.bind(this, this.state.showGameStateHistory)}
                                showCardIds={this.state.SHOW_CARD_ID}
                            />
                        </>
                    }

                    {/* Selectors */}
                    {this.state.pubSelector && <PubActivationSelector pubSelector={this.state.pubSelector} />}
                    {this.state.deckSelector && <DeckSelector deckSelector={this.state.deckSelector} cards={this.state.gameState.cards} />}
                    {this.state.actionTypeSelector && <ActionTypeSelector actionTypeSelector={this.state.actionTypeSelector} gameState={this.state.gameState} />}

                    {(/*you can not cancel actionTypeSelector*/this.state.pubSelector || this.state.deckSelector || this.state.cardSelector) &&
                        <button class="CancelButton" onClick={() => { this.setState({ cardSelector: null, pubSelector: null, deckSelector: null, actionTypeSelector: null }) }}>
                            Cancel
                        </button>
                    }

                    {SHOW_TURNS ? gs.turns.map((stEv, index) => <div key={index} style={{ fontFamily: "monospace" }}> {JSON.stringify(stEv)} </div>) : null}
                </div>
        }
        let lock = this.state.lockUI;
        return (
            <StPetersburgContext.Provider value={{ roomMembers: this.state.roomMembers }}>
                <div className={"App"} style={{ pointerEvents: lock ? "none" : "auto" }}>
                    {lock && <div className={"LoadingIndicator"}><div className={"loader"}></div></div>}
                    {game || startGamePage}
                </div>
            </StPetersburgContext.Provider>
        );
    }
}

function GameHeader(props) {
    let classNames = ["Worker", "Building", "Aristocrat", "Exchange"];
    let phases = [CardCategory.Worker, CardCategory.Building, CardCategory.Aristocrat, CardCategory.Exchange]
    return <div className={"GameHeader"}>
        {phases.map(p => {
            return <div key={p} className={classNames[p] + " " + (props.phase == p ? "current" : "")}>
                <p>{props.cards[p].length}</p>
            </div>
        })}
    </div>
}


function PubActivationSelector(props) {
    let pSelector = props.pubSelector;
    return <div className={"PubActivationSelector"}>
        <p>Select how often to use your pub:</p>
        {Array.from(Array(pSelector.possibleActivations).keys()).map(i => {
            let count = i + 1;
            return <button key={i} onClick={pSelector.onSelect.bind(null, count)}>{count * 2 + " Rubel -> " + count + " Points"}</button>
        })}
    </div>
}

function DeckSelector(props) {
    let selector = props.deckSelector;
    const options = [{ label: "Worker", category: CardCategory.Worker },
    { label: "Building", category: CardCategory.Building },
    { label: "Aristocrat", category: CardCategory.Aristocrat },
    { label: "Exchange", category: CardCategory.Exchange }];
    return <div className={"DeckSelector"}>
        {options.map(op => {
            return <button disabled={props.cards[op.category].length <= 0} onClick={selector.onSelect.bind(null, op.category)} className={op.label + " DeckCategoryButton"}>
                {op.label}<span>({props.cards[op.category].length})</span>
            </button>
        })}
    </div>
}
export const ActionType = {
    Buy: "buy",
    Take: "take",
    Discard: "discard",
}
function ActionTypeSelector(props) {
    const selector = props.actionTypeSelector;
    const curP = props.gameState.getCurrentPlayer();

    let onBuy = selector.onSelect.bind(null, ActionType.Buy);
    let onTake = selector.onSelect.bind(null, ActionType.Take);
    let onDiscard = selector.onSelect.bind(null, ActionType.Discard);

    return <div className={"DeckSelector ActionTypeSelector"}>
        <Card
            cardId={selector.cardId}
            onCardBuy={onBuy}
            onCardTake={onTake}
            onCardDiscard={onDiscard}
            skipFieldChecks={true}
            currentPlayer={curP}
            gs={props.gameState}
        />
    </div>
}

export default App;