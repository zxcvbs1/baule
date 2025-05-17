import { WalletClient, encodeFunctionData, parseEther } from 'viem';

export async function deployContract({
  walletClient,
  account,
  abi,
  bytecode,
  args = [],
}) {
  const hash = await walletClient.deployContract({
    account,
    abi,
    bytecode,
    args,
  });

  const publicClient = walletClient.extend(({ publicClient }) => publicClient);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  
  return {
    address: receipt.contractAddress,
    hash,
    receipt,
  };
}