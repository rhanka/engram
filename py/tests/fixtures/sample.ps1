using namespace System.IO
using module MyModule

function Get-Data {
    param(
        [string]$Name,
        [int]$Count = 10
    )
    $result = Process-Items -Name $Name -Count $Count
    return $result
}

function Process-Items {
    param([string]$Name, [int]$Count)
    Write-Output "Processing $Count items for $Name"
}

class DataProcessor {
    [string]$Source

    DataProcessor([string]$source) {
        $this.Source = $source
    }

    [string] Transform([string]$input) {
        return $input.ToUpper()
    }

    [void] Save([string]$path) {
        Set-Content -Path $path -Value $this.Source
    }
}
