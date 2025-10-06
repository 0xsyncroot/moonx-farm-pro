const { ethers } = require('ethers');

async function sendETHToken(receiptAddress, amounts) {
    const provider = new ethers.JsonRpcProvider('http://localhost:8645');
    const signer = new ethers.Wallet('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d', provider);
    const amount = ethers.parseUnits(amounts, 18);
    console.log('amount', amount);
    const tx = await signer.sendTransaction({
        to: receiptAddress,
        value: amount,
    });

    console.log('Transaction sent:', tx.hash);
}

sendETHToken('0x52222B4956562798fEDA884F1CfF69498AfBC9E1', '100');