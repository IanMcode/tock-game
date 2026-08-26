import { describe, expect, it } from "vitest";

import type { Card } from "../game/types";
import { findReceivedExchangeCard } from "./exchangeReceipt";

describe("exchange receipt", () => {
  it("identifies the partner card that replaced the sent card", () => {
    const before: Card[] = [
      { rank: "4", suit: "clubs" },
      { rank: "K", suit: "hearts" },
      { rank: "9", suit: "spades" },
    ];
    const received: Card = { rank: "A", suit: "diamonds" };

    expect(findReceivedExchangeCard(before, [before[0], received, before[2]], before[1])).toEqual(received);
  });
});
