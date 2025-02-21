import 'dotenv/config';
import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import {
  Protocols,
  createDecoder,
  Decoder,
  DecodedMessage,
  RelayNode,
  createEncoder,
  createLightNode,
} from '@waku/sdk';
import { createRelayNode } from '@waku/relay';
import { Type } from 'protobufjs';
import { HDNodeWallet } from 'ethers';
import { NetworkConfig, UtilsService } from '../utils/utils.service.js';
import { tcp } from '@libp2p/tcp';
import { RequestQuote, RequestToken, ResponseQuote } from 'types/index.js';

/**
 * Service that handles the processing of quote requests and sending corresponding responses.
 * It listens to incoming quote requests, processes them to compute a response, and sends the response
 * using a light node over the Waku protocol.
 */
@Injectable()
export class SolverService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SolverService.name);

  private wallet: HDNodeWallet;
  private contentTopics: string[];
  private networkConfig: NetworkConfig;
  private requestType: Type;
  private responseType: Type;
  private decoder: Decoder;
  private node: RelayNode;

  /**
   * Creates an instance of SolverService.
   *
   * @param {UtilsService} utils - Utility service providing helper methods for wallet generation,
   * message type retrieval, and network configuration.
   */
  constructor(private readonly utils: UtilsService) {
    this.wallet = this.utils.getRandomWallet();
    this.requestType = this.utils.getRequestType();
    this.responseType = this.utils.getResponseType();

    this.contentTopics = ['/iLayer/1/rfq/proto'];

    this.networkConfig = {
      clusterId: 1,
      contentTopics: this.contentTopics,
    };

    this.decoder = createDecoder(this.contentTopics[0], this.networkConfig);
  }

  /**
   * Lifecycle hook that is called once the module has been initialized.
   * It creates and starts a relay node, waits for peers, logs the connection,
   * and subscribes to incoming quote requests.
   *
   * @returns {Promise<void>}
   */
  async onModuleInit() {
    this.node = await createRelayNode({
      bootstrapPeers: [process.env.TCP_MULTIADDRESS],
      networkConfig: this.networkConfig,
      libp2p: {
        filterMultiaddrs: false,
        transports: [tcp()],
      },
    });

    await this.node.start();
    await this.node.waitForPeers([Protocols.Relay]);
    this.logger.log('Connected to TCP relay Node.');
    await this.listenToQuoteRequests();
  }

  /**
   * Lifecycle hook that is called when the module is about to be destroyed.
   * It stops the relay node.
   *
   * @returns {Promise<void>}
   */
  async onModuleDestroy() {
    this.node.stop();
  }

  /**
   * Subscribes to quote requests from the relay node.
   * In case of an error during subscription, it logs a warning and retries after 3 seconds.
   *
   * @private
   * @returns {Promise<void>}
   */
  private async listenToQuoteRequests() {
    try {
      await this.node.relay.subscribeWithUnsubscribe(
        [this.decoder],
        this.callback.bind(this),
      );
      this.logger.log('Subscribed to quotes request topic.');
    } catch (error) {
      this.logger.warn('Subscription retry...');
      setTimeout(async () => await this.listenToQuoteRequests(), 3000);
    }
  }

  /**
   * Callback function invoked when a new quote request message is received.
   * It decodes the incoming message, processes it to generate a response,
   * and then sends the response.
   *
   * @private
   * @param {DecodedMessage} message - The decoded message received from the network.
   * @returns {Promise<void>}
   */
  private async callback(message: DecodedMessage) {
    this.logger.log(`New request for quotes received.`);

    if (!message.payload) return;

    const request = this.requestType
      .decode(message.payload)
      .toJSON() as RequestQuote;

    const response = await this.processMessage(request);

    await this.sendResponse(request.bucket, response);
  }

  /**
   * Processes an incoming quote request by calculating token prices and computing updated token values.
   *
   * @param {RequestQuote} request - The quote request message.
   * @returns {Promise<ResponseQuote>} The generated response quote.
   */
  async processMessage(request: RequestQuote): Promise<ResponseQuote> {
    const tokenAddresses = this.utils.extractTokenAddresses(request);
    const prices = await this.utils.getTokenPrices(tokenAddresses);
    const fromToken = request.from.tokens[0];

    const fromTokenPrice = this.utils.getPriceForAddress(
      prices,
      fromToken.address,
    );

    if (!fromTokenPrice) {
      this.logger.error(`Price not found for ${fromToken.address}`);
      return;
    }

    const fromTokenAmountInUSD = fromToken.weight * fromTokenPrice;

    const updatedToTokens = this.utils.computeUpdatedToTokens(
      request.to.tokens,
      fromTokenAmountInUSD,
      prices,
    );

    const response: ResponseQuote = {
      solver: this.wallet.publicKey,
      from: {
        network: request.from.network,
        tokens: request.from.tokens.map((token: RequestToken) => ({
          address: token.address,
          amount: token.weight,
        })),
      },
      to: {
        network: request.to.network,
        tokens: updatedToTokens,
      },
    };

    return response;
  }

  /**
   * Sends the computed quote response back to the requester.
   * It creates a light node, encodes the response, sends it via the lightPush protocol,
   * and then stops the node.
   *
   * @private
   * @param {string} bucket - The bucket identifier used for constructing the content topic.
   * @param {ResponseQuote} response - The response quote to be sent.
   * @returns {Promise<void>}
   */
  private async sendResponse(bucket: string, response: ResponseQuote) {
    const contentTopics = [`/iLayer/1/${bucket}/proto`];

    const networkConfig = {
      clusterId: 1,
      contentTopics,
    };

    const encoder = createEncoder({
      contentTopic: contentTopics[0],
      pubsubTopicShardInfo: networkConfig,
      ephemeral: true,
    });

    const node = await createLightNode({
      bootstrapPeers: [process.env.TCP_MULTIADDRESS],
      networkConfig,
      libp2p: {
        filterMultiaddrs: false,
        transports: [tcp()],
      },
    });

    await node.start();
    await node.waitForPeers([Protocols.LightPush]);

    this.logger.log(`Sending response for quotes...`);

    const serialisedMessage = this.responseType.encode(response).finish();

    await node.lightPush.send(encoder, {
      payload: serialisedMessage,
    });

    this.logger.log(`Response for quotes sent.`);

    await node.stop();
  }
}
