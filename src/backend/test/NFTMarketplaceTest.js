const { expect } = require('chai');
const { ethers } = require('hardhat');

const toWei = (num) => ethers.utils.parseEther(num.toString());
const fromWei = (num) => ethers.utils.formatEther(num);

describe("NFTMarketplace", function() {
    let deployer, addr1, addr2, nfts, marketplace;
    let feePercentage = 2,URI = "Sample URI";
    beforeEach(async function() {
        const NFT = await ethers.getContractFactory("NFT");
        const Marketplace = await ethers.getContractFactory("Marketplace");
        //Getting signers
        [deployer, addr1, addr2] = await ethers.getSigners();
        //Deploy contracts
        nfts = await NFT.deploy();
        await nfts.deployed();
        //console.log("NFT contract successfully deployed at:", nfts.address)
        marketplace = await Marketplace.deploy(feePercentage)
        await marketplace.deployed();
        //console.log("Marketplace contract successfully deployed at", marketplace.address)
    });
    describe("Deployment", function(){
        it("Should track name and symbol of the NFT collection", async function(){
            expect(await nfts.name()).to.equal("Dapp NFTs");
            expect(await nfts.symbol()).to.equal("Dapps");
        })
        it("Should track feeAccount and feePercentage of the maketplace", async function(){
            expect(await marketplace.feePercentage()).to.equal(feePercentage);
            expect(await marketplace.feeAccount()).to.equal(deployer.address);
        });
    })
    describe("Minting NFTs", function(){
        it("Should track each minted NFT", async function(){
            //addr1 mints an NFT
            await nfts.connect(addr1).mint(URI)
            expect(await nfts.tokenCount()).to.equal(1);
            expect(await nfts.balanceOf(addr1.address)).to.equal(1);
            expect(await nfts.tokenURI(1)).to.equal(URI);
            //addr2 mints an NFT
            await nfts.connect(addr2).mint(URI)
            expect(await nfts.tokenCount()).to.equal(2);
            expect(await nfts.balanceOf(addr2.address)).to.equal(1);
            expect(await nfts.tokenURI(2)).to.equal(URI);
        });
    })
    describe("Making items for the marketplace", function(){
        beforeEach(async function(){
            //addr1 mints an nft
            await nfts.connect(addr1).mint(URI)
            //addr1 approves the marketplace to sell it
            await nfts.connect(addr1).setApprovalForAll(marketplace.address, true)
        })
        it("Should track newly created items, transfer NFT from seller to the marketplace and emit Offered event", async function(){
            //consider addr1 offers their NFT at a price of 1 ETH
            await expect(marketplace.connect(addr1).makeItem(nfts.address, 1, toWei(1)))
            .to.emit(marketplace,"Offered")
            .withArgs(
                1,
                nfts.address,
                1,
                toWei(1),
                addr1.address
            );
            //Owner should now be the marketplace
            expect(await nfts.ownerOf(1)).to.equal(marketplace.address);

            expect(await marketplace.itemCount()).to.equal(1);

            const item = await marketplace.items(1);
            expect(item.itemId).to.equal(1);
            expect(item.nft).to.equal(nfts.address);
            expect(item.tokenId).to.equal(1);
            expect(item.price).to.equal(toWei(1));
            expect(item.sold).to.equal(false);
        });
        it("Should fail if NFT Price is set to 0", async function(){
            await expect(marketplace.connect(addr1).makeItem(nfts.address, 1 ,0)).to.be.revertedWith("The NFT cannot be free");
        })
    });
    describe("Purchasing items from Marketplace", function() {
        let price = 2,totalPriceofNFTinWei;
        beforeEach(async function() {
            //addr1 mints an NFT
            await nfts.connect(addr1).mint(URI);
            //addr1 approves the marketplace to sell the NFT
            await nfts.connect(addr1).setApprovalForAll(marketplace.address, true);
            //addr1 lists the item for sale on the marketplace
            await marketplace.connect(addr1).makeItem(nfts.address, 1, toWei(price))
        })
        it("Should transfer the NFT to the buyer, charge transaction fees, and emit a Bought event", async function () {
            const sellerInitialEthBalance = await addr1.getBalance();
            const buyerInitialEthBalance = await addr2.getBalance();
            const marketplaceInitialEthBalance = await deployer.getBalance();
            //get total Price of NFT in wei
            totalPriceofNFTinWei = await marketplace.getTotalPrice(1);
            await expect(marketplace.connect(addr2).purchaseItem(1, { value : totalPriceofNFTinWei }))
            .to.emit(marketplace, "Bought")
            .withArgs(
                1,
                nfts.address,
                1,
                toWei(price),
                addr1.address,
                addr2.address
            )
            //checking the balances to ensure all the transactions were properly conducted
            const sellerFinalEthBalance = await addr1.getBalance();
            const markeplaceFinalEthBalance = await deployer.getBalance();
            expect(+fromWei(sellerFinalEthBalance)).to.equal(+price + +fromWei(sellerInitialEthBalance))
            //ensuring the marketplace got the right share of the payment
            const fee = feePercentage*price /100;
            expect(+fromWei(markeplaceFinalEthBalance)).to.equal(+fromWei(marketplaceInitialEthBalance) + fee)
            //The buyer should own the NFT
            expect(await nfts.ownerOf(1)).to.equal(addr2.address)
            //The item should be marked as sold
            expect((await marketplace.items(1)).sold).to.equal(true)
            
        })
        it("Should fail for invalid item IDs, sold items and when enough ETH is not sent", async function () {
            //Should fail if item does not exist
            await expect(marketplace.connect(addr2).purchaseItem(2, { value : totalPriceofNFTinWei})).to.be.revertedWith("Item does not exist")
            
            await expect(marketplace.connect(addr2).purchaseItem(0, { value : totalPriceofNFTinWei})).to.be.revertedWith("Item does not exist")

            await expect(marketplace.connect(addr2).purchaseItem(1, { value : toWei(price)})).to.be.revertedWith("Ether sent is not enough for item and store fee")

            await marketplace.connect(addr2).purchaseItem(1, { value : totalPriceofNFTinWei})

            await expect(marketplace.connect(deployer).purchaseItem(1, { value : totalPriceofNFTinWei})).to.be.revertedWith("Item is already sold")
        })
    })
})