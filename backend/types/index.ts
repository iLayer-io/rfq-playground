/**
 * Interface representing a token used in a quote request.
 *
 * @interface RequestToken
 * @property {string} address - The token's contract address.
 * @property {number} weight - The weight assigned to the token.
 */
export interface RequestToken {
  address: string;
  weight: number;
}

/**
 * Interface representing a quote request.
 *
 * @interface RequestQuote
 * @property {string} bucket - The identifier for grouping related requests.
 * @property {Object} from - Details about the source network of the swap.
 * @property {string} from.network - The identifier of the source network.
 * @property {RequestToken[]} from.tokens - An array of tokens available on the source network.
 * @property {Object} to - Details about the target network of the swap.
 * @property {string} to.network - The identifier of the target network.
 * @property {RequestToken[]} to.tokens - An array of tokens available on the target network.
 */
export interface RequestQuote {
  bucket: string;
  from: {
    network: string;
    tokens: RequestToken[];
  };
  to: {
    network: string;
    tokens: RequestToken[];
  };
}

/**
 * Interface representing a token in a quote response.
 *
 * @interface ResponseToken
 * @property {string} address - The token's contract address.
 * @property {number} amount - The computed amount of the token.
 */
export interface ResponseToken {
  address: string;
  amount: number;
}

/**
 * Interface representing a quote response for a token swap.
 * The `from` and `to` fields represent the networks involved in the swap:
 * - `from` corresponds to the source network.
 * - `to` corresponds to the target network.
 *
 * @interface ResponseQuote
 * @property {string} solver - The identifier of the entity (solver) that processed the quote request.
 * @property {Object} from - Details about the source network of the response.
 * @property {string} from.network - The identifier of the source network.
 * @property {ResponseToken[]} from.tokens - An array of tokens in the response from the source network.
 * @property {Object} to - Details about the target network of the response.
 * @property {string} to.network - The identifier of the target network.
 * @property {ResponseToken[]} to.tokens - An array of tokens in the response for the target network.
 */
export interface ResponseQuote {
  solver: string;
  from: {
    network: string;
    tokens: ResponseToken[];
  };
  to: {
    network: string;
    tokens: ResponseToken[];
  };
}

/**
 * Interface representing the price information of a token.
 *
 * @interface Price
 * @property {string} address - The token's contract address.
 * @property {number} price - The price of the token in USD.
 */
export interface Price {
  address: string;
  price: number;
}
