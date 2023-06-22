import { BigInt, Address, Bytes } from "@graphprotocol/graph-ts";
import {
  CTF,
  ConditionPreparation,
  TransferSingle,
  TransferBatch,
} from "../generated/CTF/CTF";
import {
  NetUserBalance,
  TokenIdCondition,
  UserBalance,
} from "../generated/schema";
import { usdcAddress } from "./utils/constants";
import { AddressZero } from "@ethersproject/constants";

export function handleConditionPreparation(event: ConditionPreparation): void {
  if (event.params.outcomeSlotCount != new BigInt(2)) {
    // only handle binary case
    return;
  }
  let conditionId = event.params.conditionId;

  const conditionalToken = CTF.bind(
    Address.fromString(event.address.toHexString())
  );

  const collectionIdOne = conditionalToken.getCollectionId(
    Bytes.fromUTF8(""),
    conditionId,
    BigInt.fromI32(1)
  );
  const collectionIdTwo = conditionalToken.getCollectionId(
    Bytes.fromUTF8(""),
    conditionId,
    BigInt.fromI32(2)
  );

  const positionIdOne = conditionalToken.getPositionId(
    Address.fromString(usdcAddress),
    collectionIdOne
  );
  const positionIdTwo = conditionalToken.getPositionId(
    Address.fromString(usdcAddress),
    collectionIdTwo
  );

  let entityOne = new TokenIdCondition(positionIdOne.toString());
  let entityTwo = new TokenIdCondition(positionIdTwo.toString());

  entityOne.condition = conditionId;
  entityOne.complement = positionIdTwo.toString();

  entityTwo.condition = conditionId;
  entityTwo.complement = positionIdOne.toString();

  entityOne.save();
  entityTwo.save();
}

function _setNetPosition(
  user: Address,
  condition: Bytes,
  tokenOne: string,
  tokenTwo: string
): void {
  let positiveBalanceAsset: string;
  let positiveBalanceAmount: BigInt;
  let tokenOneBalance = UserBalance.load(user.toHexString() + "-" + tokenOne);
  let tokenTwoBalance = UserBalance.load(user.toHexString() + "-" + tokenTwo);

  if (tokenOneBalance == null) {
    positiveBalanceAsset = tokenTwo;
    positiveBalanceAmount = tokenTwoBalance!.balance;
  } else if (tokenTwoBalance == null) {
    positiveBalanceAsset = tokenOne;
    positiveBalanceAmount = tokenOneBalance!.balance;
  } else {
    if (tokenOneBalance!.balance > tokenTwoBalance!.balance) {
      positiveBalanceAsset = tokenOne;
      positiveBalanceAmount = tokenOneBalance!.balance.minus(
        tokenTwoBalance!.balance
      );
    } else {
      positiveBalanceAsset = tokenTwo;
      positiveBalanceAmount = tokenTwoBalance!.balance.minus(
        tokenOneBalance!.balance
      );
    }
  }

  let netUserBalance = NetUserBalance.load(
    user.toHexString() + "-" + condition.toHexString()
  );

  if (netUserBalance == null) {
    netUserBalance = new NetUserBalance(
      user.toHexString() + "-" + condition.toHexString()
    );
    netUserBalance.user = user;
    netUserBalance.asset = positiveBalanceAsset;
    netUserBalance.balance = positiveBalanceAmount;
  } else {
    netUserBalance.balance = positiveBalanceAmount;
  }

  netUserBalance.save();
}

export function handleTransferSingle(event: TransferSingle): void {
  // adjust sender address

  const tokenId = event.params.id;
  let tokenIdCondition = TokenIdCondition.load(tokenId.toString());

  if (event.params.from != Address.fromString(AddressZero)) {
    let senderBalance = UserBalance.load(
      event.params.from.toHexString() + "-" + tokenId.toString()
    ) as UserBalance; // sender will always have balance so we don't need to concern ourselves with null case
    senderBalance.balance = senderBalance.balance.minus(event.params.value);
    senderBalance.save();

    _setNetPosition(
      event.params.from,
      tokenIdCondition!.condition,
      tokenIdCondition!.id,
      tokenIdCondition!.complement
    );
  }

  if (event.params.to != Address.fromString(AddressZero)) {
    let receiverBalance = UserBalance.load(
      event.params.to.toHexString() + "-" + tokenId.toString()
    );

    if (receiverBalance == null) {
      receiverBalance = new UserBalance(
        event.params.to.toHexString() + "-" + tokenId.toString()
      );
      receiverBalance.user = event.params.to;
      receiverBalance.asset = tokenId.toString();
      receiverBalance.balance = event.params.value;
    } else {
      receiverBalance.balance = receiverBalance.balance.plus(
        event.params.value
      );
    }
    receiverBalance.save();

    _setNetPosition(
      event.params.to,
      tokenIdCondition!.condition,
      tokenIdCondition!.id,
      tokenIdCondition!.complement
    );
  }
}

// what happens if they send to self? so we need to special case?

export function handleTransferBatch(event: TransferBatch): void {}
