import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { HDNodeWallet } from 'ethers';
import { Type } from 'protobufjs';
import {
  createLightNode,
  Protocols,
  createEncoder,
  createDecoder,
  Decoder,
  RelayNode,
  DecodedMessage,
} from '@waku/sdk';
import { NetworkConfig, UtilsService } from '../utils/utils.service.js';
import { tcp } from '@libp2p/tcp';
import { createRelayNode } from '@waku/relay';
import { ResponseQuote } from 'types/index.js';

/**
 * UserService manages the RFQ (Request For Quote) functionality.
 * It handles wallet creation, network configuration, subscribing to responses,
 * and sending quote requests via both relay and light nodes.
 */
@Injectable()
export class UserService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UserService.name);

  private wallet: HDNodeWallet;
  private bucket: string;
  private contentTopics: string[];
  private networkConfig: NetworkConfig;
  private requestType: Type;
  private responseType: Type;
  private decoder: Decoder;
  private node: RelayNode;

  /**
   * Creates an instance of UserService.
   * Initializes wallet, bucket, message types, content topics, network configuration, and decoder.
   *
   * @param {UtilsService} utils - Utility service for generating wallet, types, and configurations.
   */
  constructor(private readonly utils: UtilsService) {
    this.wallet = this.utils.getRandomWallet();
    this.bucket = this.utils.getBucketFromPublicKey(this.wallet);
    this.requestType = this.utils.getRequestType();
    this.responseType = this.utils.getResponseType();

    this.contentTopics = [`/iLayer/1/${this.bucket}/proto`];

    this.networkConfig = {
      clusterId: 1,
      contentTopics: this.contentTopics,
    };

    this.decoder = createDecoder(this.contentTopics[0], this.networkConfig);
  }

  /**
   * Lifecycle hook that is called after the module has been initialized.
   * Initializes the relay node, waits for peers, logs the connection,
   * and subscribes to incoming quote responses.
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
    await this.listenToQuoteResponses();
  }

  /**
   * Lifecycle hook that is called before the module is destroyed.
   * Stops the relay node.
   *
   * @returns {Promise<void>}
   */
  async onModuleDestroy() {
    await this.node.stop();
  }

  /**
   * Subscribes to quote responses from the relay node.
   * If subscription fails, retries after a delay.
   *
   * @private
   * @returns {Promise<void>}
   */
  private async listenToQuoteResponses() {
    try {
      await this.node.relay.subscribeWithUnsubscribe(
        [this.decoder],
        this.callback.bind(this),
      );
      this.logger.log('Subscribed to quotes response topic.');
    } catch (error) {
      this.logger.warn('Subscription retry...');
      setTimeout(async () => await this.listenToQuoteResponses(), 3000);
    }
  }

  /**
   * Callback function invoked upon receiving a decoded message.
   * Logs the receipt and processes the message payload to extract the quote response.
   *
   * @private
   * @param {DecodedMessage} message - The decoded message received from the network.
   * @returns {Promise<void>}
   */
  private async callback(message: DecodedMessage) {
    this.logger.log(`New response for quotes received.`);

    if (!message.payload) return;

    const response = this.responseType
      .decode(message.payload)
      .toJSON() as ResponseQuote;

    console.log(JSON.stringify(response));
  }

  /**
   * Sends a quote request using a light node.
   * Prepares the message, serializes it, and sends it via the lightPush protocol.
   * Logs each major step and stops the node after sending the request.
   *
   * @returns {Promise<void>}
   */
  async sendRequest() {
    const contentTopics = ['/iLayer/1/rfq/proto'];

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

    this.logger.log(`Sending request for quotes...`);

    const message = {
      bucket: this.bucket,
      from: {
        network: 'mainnet',
        tokens: [
          { address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', weight: 1 },
        ],
      },
      to: {
        network: 'base',
        tokens: [
          { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', weight: 30 },
          { address: '0xdac17f958d2ee523a2206206994597c13d831ec7', weight: 70 },
        ],
      },
    };

    console.log(JSON.stringify(message));

    const request = this.requestType.create(message);
    const serialisedMessage = this.requestType.encode(request).finish();

    await node.lightPush.send(encoder, {
      payload: serialisedMessage,
    });

    this.logger.log(`Request for quotes sent.`);

    await node.stop();
  }
}
