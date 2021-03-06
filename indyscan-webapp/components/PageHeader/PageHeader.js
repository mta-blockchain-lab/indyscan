import React, { Component } from 'react'
import './PageHeader.scss'
import Navbar from '../Navbar/Navbar'
import { Divider, Grid, GridColumn, GridRow } from 'semantic-ui-react'
import MenuLink from '../MenuLink/MenuLink'

const { getNetworks } = require('indyscan-api-client')

class PageHeader extends Component {
  constructor (props) {
    super()
    this.state = {
      networks: null
    }
  }

  renderNetworks (networks, activeNetwork) {
    let networkMenuLinks = []
    for (let i = 0; i < networks.length; i++) {
      const network = networks[i]
      networkMenuLinks.push(
        <MenuLink
          key={`netlink-${network.id}`}
          active={network.id === activeNetwork}
          href={`/home?network=${network.id}`}
          as={`/home/${network.id}`}>
          {network.ui.display}
        </MenuLink>
      )
    }
    return networkMenuLinks
  }

  async componentDidMount () {
    const networks = await getNetworks(this.props.baseUrl)
    this.setState({ networks })
  }

  render () {
    const { network } = this.props
    return (
      <div>
        <Grid id='page-header'>
          <GridRow>
            <h1><span style={{ color: 'darkcyan' }}>IndyScan</span></h1>
          </GridRow>
          <GridRow style={{ marginTop: '-2em' }}>
            <h5>Hyperledger Indy transaction explorer</h5>
          </GridRow>
          {
            this.state.networks &&
            <GridRow>
              <GridColumn width={11}>
                {this.renderNetworks(this.state.networks || [network], network)}
              </GridColumn>
              <GridColumn align='right' width={5}>
                <Navbar page={this.props.page} network={this.props.network} />
              </GridColumn>
            </GridRow>
          }

        </Grid>
        <Divider />
      </div>
    )
  }
}

export default PageHeader
