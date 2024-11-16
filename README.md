# Hash& anteriorize

**This plugin provide a simple way to attest existence of a given document before a given date using ethereum.**

Install activate, right click on the desired file or folder and click on "Hash and anteriorize".

The recap will then be produced with the suffix .recap.md (.md hidden). At the top of it are three payment URIs that are used to add hash in the ethereum blockchain.
The same sending address should be kept, and the containing block of each transaction should be noted at the right ; their content are the proof of anteriority.

<details>

The recap makes easy to reproduce the hash (don't forget to de-indent. splitting the document is done with "\n\n---\n").

Hash reproduction method from source method is explained in parameters, and is easy with the provided zip or recap file.
The first 64 digits (in decimal) of the final hash is split into 6 chunks of 14 digit with an overlap of 4 that are used as amount for the transaction.

The ethereum address used is those of author.

</details>

**Happy inventing.**
