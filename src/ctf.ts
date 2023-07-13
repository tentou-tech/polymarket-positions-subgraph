import { BigInt, Address, Bytes, log } from "@graphprotocol/graph-ts";
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
import { usdcAddress, AddressZero } from "./utils/constants";
import { calculatePositionIds } from "./utils/ctf-utls";

export function handleConditionPreparation(event: ConditionPreparation): void {
  if (event.params.outcomeSlotCount.equals(new BigInt(2))) {
    // only handle binary case
    return;
  }

  let conditionId = event.params.conditionId;

  const positions = calculatePositionIds(
    event.address.toHexString(),
    event.params.conditionId.toHexString(),
    usdcAddress,
    event.params.outcomeSlotCount.toI32()
  );

  let entityOne = new TokenIdCondition(positions[0].toString());
  let entityTwo = new TokenIdCondition(positions[1].toString());

  entityOne.condition = conditionId.toHexString();
  entityOne.complement = positions[1].toString();

  entityTwo.condition = conditionId.toHexString();
  entityTwo.complement = positions[0].toString();

  entityOne.save();
  entityTwo.save();

  // log.info(`registered entities with condition {} and positionIds {} and {}`, [
  //   conditionId.toHexString(),
  //   positions[0].toString(),
  //   positions[1].toString(),
  // ]);
}

function _setNetPosition(
  user: Address,
  condition: string,
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
    user.toHexString() + "-" + condition
  );

  if (netUserBalance == null) {
    netUserBalance = new NetUserBalance(user.toHexString() + "-" + condition);
    netUserBalance.user = user;
    netUserBalance.asset = positiveBalanceAsset;
    netUserBalance.balance = positiveBalanceAmount;
  } else {
    netUserBalance.balance = positiveBalanceAmount;
  }

  netUserBalance.save();
}

function _adjustSenderBalance(
  sender: Address,
  tokenCondition: TokenIdCondition,
  amount: BigInt
): void {
  // log.info(`adjusting sender balance; address: {}, token: {}, amount {}`, [
  //   sender.toHexString(),
  //   tokenCondition.id.toString(),
  //   amount.toString(),
  // ]);
  if (
    sender != Address.fromString(AddressZero) &&
    amount.gt(BigInt.fromI32(0))
  ) {
    let senderBalance = UserBalance.load(
      sender.toHexString() + "-" + tokenCondition.id.toString()
    ) as UserBalance; // sender will always have balance so we don't need to concern ourselves with null case
    senderBalance.balance = senderBalance.balance.minus(amount);
    senderBalance.save();

    _setNetPosition(
      sender,
      tokenCondition.condition,
      tokenCondition.id,
      tokenCondition.complement
    );
  }
}

function _adjustReceiverBalance(
  receiver: Address,
  tokenCondition: TokenIdCondition,
  amount: BigInt
): void {
  // log.info(`adjusting receiver balance; address: {}, token: {}, amount {}`, [
  //   receiver.toHexString(),
  //   tokenCondition.id.toString(),
  //   amount.toString(),
  // ]);
  if (
    receiver != Address.fromString(AddressZero) &&
    amount.gt(BigInt.fromI32(0))
  ) {
    let receiverBalance = UserBalance.load(
      receiver.toHexString() + "-" + tokenCondition.id.toString()
    );

    if (receiverBalance == null) {
      receiverBalance = new UserBalance(
        receiver.toHexString() + "-" + tokenCondition.id.toString()
      );
      receiverBalance.user = receiver;
      receiverBalance.asset = tokenCondition.id.toString();
      receiverBalance.balance = amount;
    } else {
      receiverBalance.balance = receiverBalance.balance.plus(amount);
    }
    receiverBalance.save();

    _setNetPosition(
      receiver,
      tokenCondition.condition,
      tokenCondition.id,
      tokenCondition.complement
    );
  }
}

export function handleTransferSingle(event: TransferSingle): void {
  const sender = event.params.from;
  const receiver = event.params.to;
  const tokenId = event.params.id;

  // log.info(`handling single transfer for sender {} receiver {} token {}`, [
  //   sender.toHexString(),
  //   receiver.toHexString(),
  //   tokenId.toString(),
  // ]);

  let tokenIdCondition = TokenIdCondition.load(tokenId.toString());

  if (tokenIdCondition == null) {
    return;
  }

  _adjustSenderBalance(sender, tokenIdCondition!, event.params.value);
  _adjustReceiverBalance(receiver, tokenIdCondition!, event.params.value);
}

export function handleTransferBatch(event: TransferBatch): void {
  const sender = event.params.from;
  const receiver = event.params.to;

  for (let i = 0; i < event.params.ids.length; i++) {
    const tokenId = event.params.ids[i];
    let tokenIdCondition = TokenIdCondition.load(tokenId.toString());

    if (tokenIdCondition == null) {
      // might be a >2 outcome condition we don't have
      return;
    }

    _adjustSenderBalance(sender, tokenIdCondition, event.params.values[i]);
    _adjustReceiverBalance(receiver, tokenIdCondition, event.params.values[i]);
  }
}
