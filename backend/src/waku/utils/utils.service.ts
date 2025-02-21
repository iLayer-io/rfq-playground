import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { HDNodeWallet, Wallet } from 'ethers';
import protobuf, { Type } from 'protobufjs';
import {
  Price,
  RequestQuote,
  RequestToken,
  ResponseToken,
} from 'types/index.js';

/**
 * Configuration for network settings.
 *
 * @typedef {Object} NetworkConfig
 * @property {number} clusterId - The identifier for the network cluster.
 * @property {string[]} contentTopics - The content topics used for messaging.
 */
export interface NetworkConfig {
  clusterId: number;
  contentTopics: string[];
}

/**
 * Utility service providing helper functions for wallet generation,
 * protobuf message type creation, token price retrieval, and token data processing.
 */
@Injectable()
export class UtilsService {
  /**
   * Generates a random HD wallet.
   *
   * @returns {HDNodeWallet} A randomly generated HDNodeWallet instance.
   */
  getRandomWallet(): HDNodeWallet {
    return Wallet.createRandom();
  }

  /**
   * Computes a bucket identifier derived from the wallet's public key.
   *
   * @param {HDNodeWallet} wallet - The wallet from which to derive the bucket.
   * @returns {string} A bucket identifier consisting of the first 8 characters of the SHA-256 hash of the wallet's public key.
   */
  getBucketFromPublicKey(wallet: HDNodeWallet): string {
    const hash = createHash('sha256').update(wallet.publicKey).digest('hex');
    return hash.substring(0, 8);
  }

  /**
   * Creates and returns the protobuf type for a quote request.
   *
   * @returns {Type} The protobuf Type representing a quote request.
   */
  getRequestType(): Type {
    const RequestToken = new protobuf.Type('RequestToken')
      .add(new protobuf.Field('address', 1, 'string'))
      .add(new protobuf.Field('weight', 2, 'int32'));

    const RequestFrom = new protobuf.Type('RequestFrom')
      .add(new protobuf.Field('network', 1, 'string'))
      .add(new protobuf.Field('tokens', 2, 'RequestToken', 'repeated'));

    const RequestTo = new protobuf.Type('RequestTo')
      .add(new protobuf.Field('network', 1, 'string'))
      .add(new protobuf.Field('tokens', 2, 'RequestToken', 'repeated'));

    const Request = new protobuf.Type('Request')
      .add(new protobuf.Field('bucket', 1, 'string'))
      .add(new protobuf.Field('from', 2, 'RequestFrom'))
      .add(new protobuf.Field('to', 3, 'RequestTo'));

    new protobuf.Root()
      .define('WakuPackage')
      .add(RequestToken)
      .add(RequestFrom)
      .add(RequestTo)
      .add(Request);

    return Request;
  }

  /**
   * Creates and returns the protobuf type for a quote response.
   *
   * @returns {Type} The protobuf Type representing a quote response.
   */
  getResponseType(): Type {
    const ResponseToken = new protobuf.Type('ResponseToken')
      .add(new protobuf.Field('address', 1, 'string'))
      .add(new protobuf.Field('amount', 2, 'int32'));

    const ResponseFrom = new protobuf.Type('ResponseFrom')
      .add(new protobuf.Field('network', 1, 'string'))
      .add(new protobuf.Field('tokens', 2, 'ResponseToken', 'repeated'));

    const ResponseTo = new protobuf.Type('ResponseTo')
      .add(new protobuf.Field('network', 1, 'string'))
      .add(new protobuf.Field('tokens', 2, 'ResponseToken', 'repeated'));

    const Response = new protobuf.Type('Response')
      .add(new protobuf.Field('solver', 1, 'string'))
      .add(new protobuf.Field('from', 2, 'ResponseFrom'))
      .add(new protobuf.Field('to', 3, 'ResponseTo'));

    new protobuf.Root()
      .define('WakuPackage')
      .add(ResponseToken)
      .add(ResponseFrom)
      .add(ResponseTo)
      .add(Response);

    return Response;
  }

  /**
   * Fetches token prices from the CoinGecko API for a list of token contract addresses.
   *
   * @param {string[]} addresses - An array of token contract addresses.
   * @returns {Promise<Price[]>} A promise that resolves to an array of Price objects containing token address and its price in USD.
   */
  async getTokenPrices(addresses: string[]): Promise<Price[]> {
    const prices: Price[] = [];

    for (const address of addresses) {
      const url = `https://api.coingecko.com/api/v3/simple/token_price/ethereum?contract_addresses=${address}&vs_currencies=usd`;

      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data[address.toLowerCase()]) {
          prices.push({
            address: address.toLowerCase(),
            price: data[address.toLowerCase()].usd,
          });
        } else {
          console.warn(`Price not found for ${address}`);
        }
      } catch (error) {
        console.error('Error fetching token price:', error);
      }
    }

    return prices;
  }

  /**
   * Extracts token contract addresses from a quote request message.
   *
   * @param {RequestQuote} message - The quote request message.
   * @returns {string[]} An array of token addresses extracted from both the 'from' and 'to' fields.
   */
  extractTokenAddresses(message: RequestQuote): string[] {
    const fromAddresses = message.from.tokens.map(
      (token: RequestToken) => token.address,
    );

    const toAddresses = message.to.tokens.map(
      (token: RequestToken) => token.address,
    );

    return [...fromAddresses, ...toAddresses];
  }

  /**
   * Retrieves the price for a specific token address from an array of Price objects.
   *
   * @param {Price[]} prices - An array of Price objects.
   * @param {string} address - The token contract address.
   * @returns {number | undefined} The price of the token in USD, or undefined if not found.
   */
  getPriceForAddress(prices: Price[], address: string): number | undefined {
    const priceObj = prices.find(
      (price: Price) => price.address.toLowerCase() === address.toLowerCase(),
    );
    return priceObj ? priceObj.price : undefined;
  }

  /**
   * Computes updated token amounts for the 'to' tokens based on the provided 'from' token amount in USD,
   * applying the respective weights and deducting a random fee.
   *
   * @param {RequestToken[]} toTokens - An array of tokens from the 'to' field in the quote request.
   * @param {number} fromTokenAmountInUSD - The total amount in USD derived from the 'from' token.
   * @param {Price[]} prices - An array of Price objects for the tokens.
   * @returns {ResponseToken[]} An array of ResponseToken objects with updated amounts after fee deduction.
   */
  computeUpdatedToTokens(
    toTokens: RequestToken[],
    fromTokenAmountInUSD: number,
    prices: Price[],
  ): ResponseToken[] {
    return toTokens.map((toToken) => {
      const toTokenPrice = this.getPriceForAddress(prices, toToken.address);

      if (!toTokenPrice) {
        console.error(`Prezzo non trovato per l'indirizzo ${toToken.address}`);
        return { address: toToken.address, amount: 0 };
      }

      const toTokenAmountInUSD = (fromTokenAmountInUSD * toToken.weight) / 100;
      const toTokenAmount = toTokenAmountInUSD / toTokenPrice;
      const feePercentage = this.getRandomFeePercentage();
      const toTokenAmountAfterFee = toTokenAmount * (1 - feePercentage);

      return { address: toToken.address, amount: toTokenAmountAfterFee };
    });
  }

  /**
   * Generates a random fee percentage within a specified range.
   *
   * @private
   * @returns {number} The random fee percentage between 0.1% and 1%.
   */
  private getRandomFeePercentage(): number {
    const minFee = 0.001; // 0.1%
    const maxFee = 0.01; // 1%
    return Math.random() * (maxFee - minFee) + minFee;
  }
}
