import {
    SubscribeMessage,
    MessageBody,
    ConnectedSocket,
    WebSocketServer,
    WebSocketGateway,
    OnGatewayConnection,
    OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChickenRoadService } from './chicken_road.service';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
    cors: {
        origin: '*',
        credentials: true,
    },
    // namespace: '/chicken', // Removed to match client connection to root
})
export class ChickenRoadGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    constructor(
        private chickenService: ChickenRoadService,
        private jwtService: JwtService,
    ) { }

    async handleConnection(client: Socket) {
        // Authentication logic similar to Blackjack
        try {
            const token =
                client.handshake.auth?.token ||
                client.handshake.headers?.authorization?.split(' ')?.[1];

            if (!token) {
                client.disconnect();
                return;
            }

            const decoded = this.jwtService.verify(token);
            client.data.userId = decoded.sub.toString();
            console.log(`🐔 Cliente Chicken conectado: ${client.data.userId}`);
        } catch (error) {
            client.disconnect();
        }
    }

    handleDisconnect(client: Socket) {
        console.log(`🐔 Cliente Chicken desconectado: ${client.data.userId}`);
    }

    @SubscribeMessage('joinChickenGame')
    async handleJoin(@ConnectedSocket() client: Socket) {
        const userId = client.data.userId;
        if (!userId) return;

        const state = await this.chickenService.initGame(userId);
        client.emit('chickenGameState', state);
    }

    @SubscribeMessage('placeChickenBet')
    async handleBet(
        @MessageBody() data: { amount: number },
        @ConnectedSocket() client: Socket,
    ) {
        const userId = client.data.userId;
        try {
            const result = await this.chickenService.processBet(userId, data.amount);
            client.emit('chickenBetAccepted', result);
        } catch (error) {
            client.emit('chickenError', { message: error.message });
        }
    }

    @SubscribeMessage('chickenGameResult')
    async handleResult(
        @MessageBody() data: { bet: number; won: boolean },
        @ConnectedSocket() client: Socket,
    ) {
        const userId = client.data.userId;
        try {
            const result = await this.chickenService.processResult(
                userId,
                data.bet,
                data.won,
            );
            client.emit('chickenGameFinished', result);
        } catch (error) {
            console.error('Error processing chicken result', error);
        }
    }
}
