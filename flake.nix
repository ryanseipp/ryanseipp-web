{
  description = "Everything behind the ryanseipp.com domain";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = {
    self,
    nixpkgs,
    flake-utils,
  }:
    flake-utils.lib.eachDefaultSystem (system: let
      pkgs = import nixpkgs {inherit system;};
    in {
      formatter = pkgs.alejandra;

      devShells.default = pkgs.mkShell {
        packages =
          (with pkgs; [
            nodejs_20
            tailwindcss-language-server
            nodePackages."@astrojs/language-server"
          ])
          ++ (with pkgs.nodePackages; [
            pnpm
            prettier
            typescript
          ]);
      };
    });
}
